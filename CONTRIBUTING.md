# Contributing Guidelines
Making changes to the Demo Connector

## Testing Your Changes
* To test locally, run:
```
$ npm start
```
and change your org's call center adapter URL to https://localhost:8080 (accept the certificates if needed)

* To bundle the source code in the src folder into one connector.js file:
```
$ gulp bundle
```
* To bundle the source code in the src folder into one minified connector_min.js file:
```
$ gulp bundle --mode prod
```
 
## Release Versions
For each new Salesforce release a new branch must be created:
 - duplicate master branch code  

### Git Workflow

After you fork and clone the repo, the process for submitting a pull request is fairly straightforward and
generally follows this workflow:

1. [Create a feature branch](#create-a-feature-branch)
2. [Make your changes](#make-your-changes)
3. [Rebase](#rebase)
4. [Write unit tests](#Write-unit-tests)
5. [Create a pull request](#create-a-pull-request)
6. [Update the pull request](#update-the-pull-request)

#### Create a feature branch

```bash
git checkout master
git pull upstream master
git checkout -b <name-of-the-feature>
```

#### Make your changes

Modify the files, build, test, lint and eventually commit your code using the following command:

```bash
git add <path/to/file/to/commit>
git commit
git push origin <name-of-the-feature>
```

The above commands commit the files into your feature branch. You can keep
pushing new changes into the same branch until you are ready to create a pull
request.

#### Rebase

Sometimes your feature branch gets stale with respect to the master branch,
and requires a rebase. The following steps can help:

```bash
git checkout <name-of-the-feature>
git fetch upstream
git rebase upstream/master
```

_Note: If no conflicts arise, these commands ensure that your changes are applied on top of the latest changes from the master branch. Any conflicts must be manually resolved._

#### Write unit tests

We use the Jest testing framework. You must test your code to verify that the function works as expected. Create unit tests in the `/src/test/` subfolder

#### Run unit tests

```sh
npm test
```

### Create a pull request

If you've never created a pull request before, follow [these
instructions][creating-a-pull-request]. Fill up the pull request template to inform us of your change.

### Update the pull request

```sh
git fetch origin
git rebase origin/${base_branch}

# If there were no merge conflicts in the rebase
git push origin ${feature_branch}

# If there was a merge conflict that was resolved
git push origin ${feature_branch} --force
```

_note: If more changes are needed as part of the pull request, just keep committing and pushing your feature branch as described above and the pull request automatically updates._