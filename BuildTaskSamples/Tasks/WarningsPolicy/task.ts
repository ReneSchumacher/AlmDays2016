/// <reference path="../../typings/main.d.ts" />

import path = require('path');
import tl = require('vsts-task-lib/task');
import webapi = require('vso-node-api/WebApi');
import buildIf = require('vso-node-api/interfaces/BuildInterfaces');
import buildapi = require('vso-node-api/BuildApi');

function getLastBuildTimelineByDefId(project: string, definitionId: number) {
    var resultFilter = buildIf.BuildResult.Succeeded | buildIf.BuildResult.PartiallySucceeded;
    if (!tl.getBoolInput('succeededBuildsOnly')) {
        resultFilter |= buildIf.BuildResult.Failed;
    }
    return buildClient.getBuilds(project, [definitionId], null, null, null, null, null, null,
        buildIf.BuildStatus.Completed, resultFilter, null, null, null, 1)
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
        tl.debug('Timeline does not exist or has no records.');
        return -1;
    }
    
    // If no task filters are configured, include all timelines
    var relevantRecords = timeline.records.filter(record => {
        return taskFilters.length ? taskFilters.some(exp => {
            return exp ? exp.test(record.name) : false;
        }) : true;
    });
    tl.debug('Counting warnings from tasks:');
    
    relevantRecords.forEach(record => {
        tl.debug('   ' + record.name);
        warnings += record.warningCount;
    });
    
    if (!relevantRecords.length) {
        tl.warning(tl.loc('NoMatchingFilter'));
    }
    
    return warnings;
}

tl.setResourcePath(path.join(__dirname, 'task.json'));

var failOnThreshold = tl.getInput('failOption', true) == 'fixed';
var taskFilters = tl.getDelimitedInput('taskFilters', '\n').map(filter => {
    var regexTokens = filter.substring(1).split(filter[0]);
    try {
        var reg = new RegExp(regexTokens[0], regexTokens[1]);
        return reg;
    }
    catch (ex) {
        tl.warning(tl.loc('InvalidRegEx', filter));
        return null;
    }
});
tl.debug(taskFilters.toString());

var token = tl.getVariable('System.AccessToken');
if (!token) {
    tl.error(tl.loc('NoOAuthAccess'));
    tl.setResult(tl.TaskResult.Failed, tl.loc('NoOAuthAccess'));
}

var credHandler = webapi.getBearerHandler(token);
var buildClient = new webapi.WebApi(tl.getVariable('System.TeamFoundationCollectionUri'), credHandler).getQBuildApi();
var project = tl.getVariable('System.TeamProject');
var definitionId = Number(tl.getVariable('System.DefinitionId'));
var buildId = Number(tl.getVariable('Build.BuildId'));

buildClient.getBuildTimeline(project, buildId)
.then(countWarnings)
.then(function (currentWarnings) {
    tl.debug('Evaluate warnings');
    if (!failOnThreshold) {
        getLastBuildTimelineByDefId(project, definitionId)
        .then(countWarnings)
        .then(function (lastWarnings) {
            if (lastWarnings >= 0 && currentWarnings > lastWarnings) {
                tl.error(tl.loc('PrevBuildExceeded', currentWarnings, lastWarnings));
                tl.setResult(tl.TaskResult.Failed, tl.loc('PrevBuildExceeded', currentWarnings, lastWarnings));
            }
        })
    } else {
        var maxWarnings = Number(tl.getInput('warningThreshold', true));
        if (currentWarnings > maxWarnings) {
            tl.error(tl.loc('ThresholdExceeded', currentWarnings, maxWarnings));
            tl.setResult(tl.TaskResult.Failed, tl.loc('ThresholdExceeded', currentWarnings, maxWarnings));
        }
    }
})
.done();