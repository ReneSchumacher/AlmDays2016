##Team Foundation Build Task Samples
Welcome to my Team Foundation Build custom build task sample repo. Here you can find interesting and (hopefully) useful
samples for custom build tasks to use with Team Foundation Build on VSTS as well as TFS 2015 Update 2 and up.

####How to use the samples
Before you start, make sure to install the latest version of [Node.js](http://nodejs.org) and install Gulp globally
by running `npm i -g gulp`.
 
Once you have set up the prerequisites, run `npm install` in the *BuildTaskSamples* to restore the Node packages used by
the build process. You can then use Gulp as follows:

- `gulp init` - This will initialize the dev environment, i.e., setting up all type definitions, restoring all node packages
for all sample tasks.

- `gulp [build]` - This will run the end-to-end build for all samples, compiling all typscript files, packaging the tasks
into the *_build/Tasks* directory as well as putting together the task documentation in the *_build/Docs* directory.
 
After running the full build, take a look at the documentation to see what the sample tasks do and how they are used.
 
####Installing tasks to your TFS or VSTS account
To install tasks to TFS or VSTS, follow the steps described [here](https://github.com/Microsoft/tfs-cli).