var gulp = require('gulp');
var gutil = require('gulp-util');
var tsc = require('gulp-tsc');
var map = require('map-stream');
var fs = require('fs');
var del = require('del');
var shell = require('shelljs');
var path = require('path');
var cp = require('child_process');

var _buildRoot = path.join(__dirname, '_build', 'Tasks');

gulp.task('cleanTypeDefs', function() {
    return del(['typings'])
});

gulp.task('cleanTaskOutputs', function() {
    return del(['Tasks/**/*.js'])
});

gulp.task('clean', ['cleanTypeDefs', 'cleanTaskOutputs']);

gulp.task('restoreTypeDefs', ['cleanTypeDefs'], function(cb) {
    gutil.log('Restoring type definitions...');
    var typings = shell.which('typings');
    if (!typings) {
        cb(new gutil.PluginError('restoreTypeDefs', 'typings not found.'));
    }
    
    cp.execSync('"' + typings + '" install');
    cb();
});

gulp.task('mergeTypeDefs', ['restoreTypeDefs'], function(cb) {
    gulp.src('definitions/**/*.d.ts')
        .pipe(map(updateMain))
        .pipe(gulp.dest('typings/main'));
    cb();
});

gulp.task('compileTasks', ['cleanTaskOutputs', 'mergeTypeDefs'], function(cb) {
    var tasksPath = path.join(__dirname, 'Tasks');
    
    gulp.src(path.join(tasksPath, '**/*.ts'))
        .pipe(tsc())
        .pipe(gulp.dest(tasksPath));
    cb();    
});

gulp.task('compile', ['compileTasks']);

gulp.task('build', ['compile'], function(cb) {
    // TODO: add build logic
});

gulp.task('default', ['build']);

//-----------------------------------------------------------------------------------------------------------------
// Internal Functions
//-----------------------------------------------------------------------------------------------------------------

var updateMain = function(file, cb) {
    gutil.log('Merging ' + file.relative + ' into typings/main.d.ts');
    // Replace backslashes by regular slashes - cannot use regex, since the backslash in the path is not escaped!
    fs.appendFile('typings/main.d.ts', '/// <reference path="main/' + file.relative.toString().replace(String.fromCharCode(92), '/') + '" />', (err) => {
        cb(err, file);
    })
};