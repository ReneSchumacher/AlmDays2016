var gulp = require('gulp');
var gutil = require('gulp-util');
var gulpIf = require('gulp-if');
var typings = require('gulp-typings');
var install = require('gulp-install');
var tsc = require('gulp-tsc');
var map = require('map-stream');
var fs = require('fs');
var del = require('del');
var shell = require('shelljs');
var path = require('path');
var cp = require('child_process');

var _initFile = path.join(__dirname, 'init.done');
var _buildRoot = path.join(__dirname, '_build', 'Tasks');

gulp.task('cleanTypeDefs', function() {
    return del(['typings']);
});

gulp.task('clean', function() {
    return del([
        'Tasks/**/*.js',
        _buildRoot
    ]);
});

gulp.task('cleanAll', ['clean', 'cleanTypeDefs'], function() {
    return del([
        'Tasks/**/node_modules',
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

gulp.task('build', ['compile'], function(cb) {
    // TODO: add build logic
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
};