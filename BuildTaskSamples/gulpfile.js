var gulp = require('gulp');
var gutil = require('gulp-util');
var gulpIf = require('gulp-if');
var typings = require('gulp-typings');
var install = require('gulp-install');
var tsc = require('gulp-tsc');
var map = require('map-stream');
var semver = require('semver');
var fs = require('fs');
var del = require('del');
var shell = require('shelljs');
var path = require('path');
var cp = require('child_process');
var pkgm = require('./package');

var NPM_MIN_VER = '3.0.0';
var MIN_NODE_VER = '4.0.0';

if (semver.lt(process.versions.node, MIN_NODE_VER)) {
    console.error('requires node >= ' + MIN_NODE_VER + '.  installed: ' + process.versions.node);
    process.exit(1);
}

shell.config.silent = true;

var _initFile = path.join(__dirname, 'init.done');
var _tempPath = path.join(__dirname, '_temp');
var _buildRoot = path.join(__dirname, '_build');
var _buildTaskRoot = path.join(_buildRoot, 'Tasks');
var _buildDocsRoot = path.join(_buildRoot, 'Docs');

gulp.task('cleanTypeDefs', function() {
    return del(['typings']);
});

gulp.task('clean', function() {
    return del([
        'Tasks/**/*.js',
        _buildTaskRoot,
        _buildDocsRoot
    ]);
});

gulp.task('cleanAll', ['clean', 'cleanTypeDefs'], function() {
    return del([
        'Tasks/**/node_modules',
        _buildRoot,
        _tempPath,
        _initFile
    ]);
});

gulp.task('installTypeDefs', function() {
    return gulp.src('./typings.json')
        .pipe(gulpIf(!shell.test('-f', _initFile), typings()));
});

gulp.task('mergeTypeDefs', ['installTypeDefs'], function() {
    return gulp.src('definitions/**/*.d.ts')
        .pipe(map(mergeTypeDefs))
        .pipe(gulp.dest('typings/main'));
});

gulp.task('installTaskPackages', function() {
    return gulp.src('Tasks/**/package.json')
        .pipe(gulpIf(!shell.test('-f', _initFile), install()));
});

gulp.task('init', ['mergeTypeDefs', 'installTaskPackages'], function(cb) {
    try {
        getNpmExternal('vsts-task-lib');
        getNpmExternal('vsts-task-sdk');
    }
    catch (err) {
        console.log('error:' + err.message);
        cb(new gutil.PluginError('compileTasks', err.message));
        return;
    }
    
    shell.touch(_initFile);
    cb();
});

gulp.task('compileTasks', ['clean', 'init'], function() {
    var tasksPath = path.join(__dirname, 'Tasks');

    return gulp.src(path.join(tasksPath, '**/*.ts'))
        .pipe(tsc())
        .pipe(gulp.dest(tasksPath));
});

gulp.task('compile', ['compileTasks']);

gulp.task('layoutDocs', function() {
    return gulp.src([path.join(__dirname, 'Tasks', '**/*.md'), path.join(__dirname, 'Tasks', '**/docs', 'assets/*')])
        .pipe(pkgm.PackageDocs(_buildDocsRoot));
});

gulp.task('build', ['compileTasks', 'layoutDocs'], function(cb) {
    // Layout the tasks.
    shell.mkdir('-p', _buildTaskRoot);
    return gulp.src(path.join(__dirname, 'Tasks', '**/task.json'))
        .pipe(pkgm.PackageTask(_buildTaskRoot));
});

gulp.task('default', ['build']);

//-----------------------------------------------------------------------------------------------------------------
// Internal Functions
//-----------------------------------------------------------------------------------------------------------------

var mergeTypeDefs = function(file, cb) {
    if (shell.test('-f', path.join('typings', 'main', file.relative))) {
        gutil.log('Skipping ' + path.basename(file.path) + ' - already merged');
        cb();
    } else {
        gutil.log('Merging ' + path.basename(file.path) + ' into typings/main.d.ts');
        // Replace backslashes by regular slashes - cannot use regex, since the backslash in the path is not escaped!
        fs.appendFile('typings/main.d.ts', '/// <reference path="main/' + file.relative.toString().replace(String.fromCharCode(92), '/') + '" />', (err) => {
            cb(err, file);
        });
    }
}

var getNpmExternal = function (name) {
    var externals = require('./externals.json');
    var libVer = externals[name];
    if (!libVer) {
        throw new Error('External module not defined in externals.json: ' + name);
    }

    gutil.log('Acquiring ' + name + ': ' + libVer);

    var libPath = path.join(_tempPath, name, libVer);
    shell.mkdir('-p', path.join(libPath, 'node_modules'));

    var pkg = {
        "name": "temp",
        "version": "1.0.0",
        "description": "temp to avoid warnings",
        "main": "index.js",
        "dependencies": {},
        "devDependencies": {},
        "repository": "http://norepo/but/nowarning",
        "scripts": {
            "test": "echo \"Error: no test specified\" && exit 1"
        },
        "author": "",
        "license": "MIT"
    };
    fs.writeFileSync(path.join(_tempPath, 'package.json'), JSON.stringify(pkg, null, 2));

    shell.pushd(libPath);
    var completedPath = path.join(libPath, 'installcompleted');
    if (shell.test('-f', completedPath)) {
        gutil.log('Package already installed. Skipping.');
        shell.popd();
        return;
    }

    var npmPath = shell.which('npm');
    if (!npmPath) {
        throw new Error('npm not found.  ensure npm 3 or greater is installed');
    }

    var s = cp.execSync('"' + npmPath + '" --version');
    var ver = s.toString().replace(/[\n\r]+/g, '')
    gutil.log('version: "' + ver + '"');

    if (semver.lt(ver, NPM_MIN_VER)) {
        throw new Error('NPM version must be at least ' + NPM_MIN_VER + '. Found ' + ver);
    }

    var cmdline = '"' + npmPath + '" install ' + name + '@' + libVer;
    var res = cp.execSync(cmdline);
    gutil.log(res.toString());

    shell.popd();
    if (res.status > 0) {
        throw new Error('npm failed with code of ' + res.status);
    }

    fs.writeFileSync(completedPath, '');
}