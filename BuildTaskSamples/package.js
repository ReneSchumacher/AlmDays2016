var through = require('through2');
var gutil = require('gulp-util');
var path = require('path');
var fs = require('fs');
var check = require('validator');
var shell = require('shelljs');
var Q = require('q');

var _strRelPath = path.join('Strings', 'resources.resjson', 'en-US');

var _tempPath = path.join(__dirname, '_temp');
shell.mkdir('-p', _tempPath);

var createError = function(msg) {
	return new gutil.PluginError('PackageTask', msg);
}

var validateTask = function(folderName, task) {
	var defer = Q.defer();

	var vn = (task.name  || folderName);

	if (!task.id || !check.isUUID(task.id)) {
		defer.reject(createError(vn + ': id is a required guid'));
	};

	if (!task.name || !check.isAlphanumeric(task.name)) {
		defer.reject(createError(vn + ': name is a required alphanumeric string'));
	}

	if (!task.friendlyName || !check.isLength(task.friendlyName, 1, 40)) {
		defer.reject(createError(vn + ': friendlyName is a required string <= 40 chars'));
	}

	if (!task.instanceNameFormat) {
		defer.reject(createError(vn + ': instanceNameFormat is required'));	
	}

	// resolve if not already rejected
	defer.resolve();
	return defer.promise;
};

var LOC_FRIENDLYNAME = 'loc.friendlyName';
var LOC_HELPMARKDOWN = 'loc.helpMarkDown';
var LOC_DESCRIPTION = 'loc.description';
var LOC_INSTFORMAT = 'loc.instanceNameFormat';
var LOC_GROUPDISPLAYNAME = 'loc.group.displayName.';
var LOC_INPUTLABEL = 'loc.input.label.';
var LOC_INPUTHELP = 'loc.input.help.';
var LOC_INPUTOPTION = 'loc.input.option.';
var LOC_MESSAGE = 'loc.message.';

var createStrings = function(task, pkgPath, srcPath) {
	var defer = Q.defer();

	var strPath = path.join(pkgPath, _strRelPath);
	shell.mkdir('-p', strPath);
	var srcStrPath = path.join(srcPath, _strRelPath);
	shell.mkdir('-p', srcStrPath);

	//
	// Loc tasks.json and product strings content
	//
	var strings = {};
	strings[LOC_FRIENDLYNAME] = task.friendlyName;
	task['friendlyName'] = 'ms-resource:' + LOC_FRIENDLYNAME;
	
	strings[LOC_HELPMARKDOWN] = task.helpMarkDown;
	task['helpMarkDown'] = 'ms-resource:' + LOC_HELPMARKDOWN;

	strings[LOC_DESCRIPTION] = task.description;
	task['description'] = 'ms-resource:' + LOC_DESCRIPTION;

	strings[LOC_INSTFORMAT] = task.instanceNameFormat;
	task['instanceNameFormat'] = 'ms-resource:' + LOC_INSTFORMAT;

	if (task.groups) {
		task.groups.forEach(function(group) {
			if (group.name) {
				var key = LOC_GROUPDISPLAYNAME + group.name;
				strings[key] = group.displayName;
				group.displayName = 'ms-resource:' + key;
			}
		});
	}

	if (task.inputs) {
		task.inputs.forEach(function(input) {
			if (input.name) {
				var labelKey = LOC_INPUTLABEL + input.name;
				strings[labelKey] = input.label;
				input.label = 'ms-resource:' + labelKey; 

				if (input.helpMarkDown) {
					var helpKey = LOC_INPUTHELP + input.name;
					strings[helpKey] = input.helpMarkDown;
					input.helpMarkDown = 'ms-resource:' + helpKey;				
				}
                
                // Currently not supported
                if (input.options) {
                    var optionBaseKey = LOC_INPUTOPTION + input.name + '.';
                    Object.keys(input.options).forEach(function (option) {
                        var optionKey = optionBaseKey + option;
                        strings[optionKey] = input.options[option];
                        input.options[option] = 'ms-resource:' + optionKey;
                    });
                }
			}
		});
	}	

	if (task.messages) {
		for(var key in task.messages) {
			var messageKey = LOC_MESSAGE + key;
			strings[messageKey] = task.messages[key];
			task.messages[key] = 'ms-resource:' + messageKey;
		}
	}	
	
	//
	// Write the tasks.json and strings file in package and back to source
	//
	var enPath = path.join(strPath, 'resources.resjson');
	var enSrcPath = path.join(srcStrPath, 'resources.resjson');

	var enContents = JSON.stringify(strings, null, 2);
	fs.writeFile(enPath, enContents, function(err) {
		if (err) {
			defer.reject(createError('could not create: ' + enPath + ' - ' + err.message));
			return;
		}

		var taskPath = path.join(pkgPath, 'task.loc.json');

		var contents = JSON.stringify(task, null, 2);

		fs.writeFile(taskPath, contents, function(err) {
			if (err) {
				defer.reject(createError('could not create: ' + taskPath + ' - ' + err.message));
				return;
			}

			// copy the loc assets back to the src so they can be checked in
			shell.cp('-f', enPath, enSrcPath);
			shell.cp('-f', taskPath, path.join(srcPath, 'task.loc.json'));

			defer.resolve();			
		});

	})

	return defer.promise;
};

function packageDocs(docPath) {
    return through.obj(
        function(docFile, encoding, done) {
            // docFile is one of the following:
            //   - .../TaskName/someFile.md
            //   - .../TaskName/docs/someFile.md
            //   - .../TaskName/docs/lang/someFile.md
            //
            // Output should be one of the following:
            //   - docPath/TaskName/someFile.md
            //   - docPath/TaskName/lang/someFile.md
            var file = path.basename(docFile.relative);
            var oldPath = path.dirname(docFile.relative);
            var pathParts = oldPath.split(path.sep).filter(function (part) {
                return part != 'docs';
            });
            var newPath = path.join(docPath, pathParts.join(path.sep));
            shell.mkdir('-p', newPath);
            
            var newFile = path.join(newPath, file);
            fs.writeFileSync(newFile, docFile.contents, encoding);
            this.push(new gutil.File({
                path: newFile,
                contents: docFile.contents
            }));
            done();
        });
}

function packageTask(pkgPath) {
    return through.obj(
		function(taskJson, encoding, done) {
		    if (!fs.existsSync(taskJson)) {
		        new gutil.PluginError('PackageTask', 'Task json cannot be found: ' + taskJson.path);
		    }

	        if (taskJson.isNull() || taskJson.isDirectory()) {
	            this.push(taskJson);
	            return callback();
	        }

	        var dirName = path.dirname(taskJson.path);
	        var folderName = path.basename(dirName);
	        var jsonContents = taskJson.contents.toString();
	        var task = {};

	        try {
	        	task = JSON.parse(jsonContents);
	        }
	        catch (err) {
	        	done(createError(folderName + ' parse error: ' + err.message));
	        	return;
	        }

	        var tgtPath;

	        validateTask(folderName, task)
	        .then(function() {
                // Copy the task to the layout folder.
                gutil.log('Packaging: ' + task.name);
                tgtPath = path.join(pkgPath, task.name);
                shell.mkdir('-p', tgtPath);
                shell.cp('-R', dirName + '/', tgtPath);
                shell.rm(path.join(tgtPath, '*.csproj'));
                shell.rm(path.join(tgtPath, '*.md'));
                shell.rm(path.join(tgtPath, '*.ts'));
                shell.rm('-Rf', path.join(tgtPath, 'docs'));

                // Build a list of external task lib dependencies.
                var externals = require('./externals.json');
                var libDeps = [ ];
                if (task.execution['Node']) {
                    libDeps.push({
                        "name": "vsts-task-lib",
                        "src": "node_modules",
                        "dest": "node_modules"
                    });
                }

                if (task.execution['PowerShell3']) {
                    libDeps.push({
                        "name": "vsts-task-sdk",
                        "src": path.join("node_modules", "vsts-task-sdk", "VstsTaskSdk"),
                        "dest": path.join("ps_modules", "VstsTaskSdk")
                    });
                }

                // Statically link the required external task libs.
                libDeps.forEach(function (libDep) {
                    var libVer = externals[libDep.name];
                    if (!libVer) {
                        throw new Error('External ' + libDep.name + ' not defined in externals.json.');
                    }

                    gutil.log('Linking ' + libDep.name + ' ' + libVer + ' into ' + task.name);
                    var tskLibSrc = path.join(__dirname, '_temp', libDep.name, libVer, libDep.src);
                    if (shell.test('-d', tskLibSrc)) {
                        new gutil.PluginError('PackageTask', libDep.name + ' not found: ' + tskLibSrc);
                    }

                    var dest = path.join(tgtPath, libDep.dest) 
                    shell.mkdir('-p', dest);
                    shell.cp('-Rf', tskLibSrc + '/', dest);
                })

	        	return;
	        })
	        .then(function() {
	        	return createStrings(task, tgtPath, dirName);
	        })
	        .then(function() {
	        	done();
	        })
	        .fail(function(err) {
	        	done(err);
	        })
		});    
}

exports.PackageDocs = packageDocs;
exports.PackageTask = packageTask;
