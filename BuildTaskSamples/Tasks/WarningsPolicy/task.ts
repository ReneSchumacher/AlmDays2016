/// <reference path="../../typings/main.d.ts" />

import path = require('path');
import tl = require('vsts-task-lib/task');
import webapi = require('vso-node-api/WebApi');
import buildIf = require('vso-node-api/interfaces/BuildInterfaces');
import buildapi = require('vso-node-api/BuildApi');

function getLastBuildTimelineByDefId(project: string, definitionId: number) {
    return buildClient.getBuilds(project, [definitionId], null, null, null, null, null, null,
        buildIf.BuildStatus.Completed, null, null, null, null, 1)
        .then(function (builds) {
            if (builds.length > 0) {
                return buildClient.getBuildTimeline(project, builds[0].id);
            } else {
                return null;
            }
        });
}

function countWarnings(timeline: buildIf.Timeline) {
    var warnings = 0;
    
    if (!timeline || !timeline.records) {
        return -1;
    }
    
    // If no task filters are configured, include all timelines
    timeline.records.filter(record => {
        return taskFilters.length ? taskFilters.some(exp => {
            return exp.test(record.name);
        }) : true;
    }).forEach(record => {
        warnings += record.warningCount;
    });
    
    return warnings;
}

tl.setResourcePath(path.join(__dirname, 'task.json'));

var failOnThreshold = tl.getInput('failOption', true) == 'fixed';
var taskFilters = tl.getDelimitedInput('taskFilters', '\n').map(filter => {
    return new RegExp(filter);
});

var token = tl.getVariable('System.AccessToken');
if (!token) {
    tl.setResult(tl.TaskResult.Failed, tl.loc('NoOAuthAccess'));
}

var credHandler = webapi.getBearerHandler(token);
var buildClient = new webapi.WebApi(tl.getVariable('System.TeamFoundationCollectionUri'), credHandler).getQBuildApi();
var project = tl.getVariable('System.TeamProject');
var definitionId = Number(tl.getVariable('System.DefinitionId'));

buildClient.getBuildTimeline(project, definitionId)
.then(countWarnings)
.then(function (currentWarnings) {
    if (!failOnThreshold) {
        getLastBuildTimelineByDefId(project, definitionId)
        .then(countWarnings)
        .then(function (lastWarnings) {
            if (lastWarnings >= 0 && currentWarnings > lastWarnings) {
                tl.setResult(tl.TaskResult.Failed, tl.loc('PrevBuildExceeded', currentWarnings, lastWarnings));
            }
        })
    } else {
        var maxWarnings = Number(tl.getInput('warningThreshold', true));
        if (currentWarnings > maxWarnings) {
            tl.setResult(tl.TaskResult.Failed, tl.loc('ThresholdExceeded', currentWarnings, maxWarnings));
        }
    }
})
.done();