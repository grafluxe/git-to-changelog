#!/usr/bin/env node

/**
 * @author Leandro Silva
 * @copyright 2018 Leandro Silva (http://grafluxe.com)
 * @license MIT
 *
 * @classdesc A simple no-frills CLI tool to create a changelog file based on git commits.
 */

let fs = require("fs"),
    exec = require("child_process").exec,
    comparePkgVersion = require("compare-versions"),
    pkg = require("../../package.json"),
    commitURI,
    out;

if (pkg.homepage) {
  let dir = (pkg.homepage.includes("bitbucket") ? "/commits/" : "/commit/");
  commitURI = pkg.homepage + dir;
}

getCommits()
  .then(splitCommits)
  .then(formatCommits)
  .then(flagIndention)
  .then(setHeader)
  .then(handleFirstCommitVersion)
  .then(prepareOutput)
  .then(save)
  .catch(err => {
    console.error("There was an error creating your changelog.\n\n" + err);
  });

function getCommits() {
  return new Promise((res, rej) => {
    exec("git log --topo-order --date=short --format=\"%cd~>%d~>%h~>%s~>%p\"", (err, commits) => {
      if (err) {
        rej(err);
      }

      res(commits);
    });
  });
}

function splitCommits(commits) {
  return Promise.resolve(commits.trim().split("\n"));
}

function formatCommits(commits) {
  let lastParent;

  return Promise.resolve(commits.map(commit => {
    let [date, refNames, hash, subject, parents] = commit.split("~>"),
        mergeCommitStart = false,
        mergeCommitEnd = false,
        validTag,
        tag;

    if (refNames && refNames.includes("tag:")) {
      validTag = refNames.match(/tag: v?(\d{1,}\.\d{1,}\.\d{1,}[^,)]*)/);

      if (validTag) {
        tag = validTag[1].trim();
      }
    } else {
      tag = null;
    }

    if (parents && parents.includes(" ")) {
      mergeCommitStart = true;
      lastParent = parents.slice(0, parents.indexOf(" "));
      subject = subject.replace(/^Merge branch ('.+?').*/, "Implement $1");
    } else if (parents === lastParent) {
      mergeCommitEnd = true;
    }

    return {date, tag, hash, subject, mergeCommitStart, mergeCommitEnd};
  }));
}

function flagIndention(formattedCommits) {
  return Promise.resolve(formattedCommits.map((commit, i) => {
    if (i > 0) {
      let prevCommit = formattedCommits[i - 1];

      if (commit.tag || commit.mergeCommitStart || prevCommit.mergeCommitEnd) {
        commit.indent = false;
      } else if (prevCommit.mergeCommitStart || prevCommit.indent) {
        commit.indent = true;
      } else {
        commit.indent = false;
      }
    } else {
      commit.indent = false;
    }

    return commit;
  }));
}

function setHeader(formattedCommits) {
  out = "# Changelog\n";

  return Promise.resolve(formattedCommits);
}

function handleFirstCommitVersion(formattedCommits) {
  return new Promise((res, rej) => {
    exec("git log --tags -1 --format=\"%d\"", (err, commit) => {
      if (err) {
        rej(err);
      }

      let pkgVers = pkg.version,
          tag,
          latestTag = "0.0.0";

      tag = commit.match(/tag: v?(\d{1,}\.\d{1,}\.\d{1,}[^,)]*)/);

      if (tag) {
        latestTag = tag[1].trim();
      }

      if (comparePkgVersion(pkgVers, latestTag) === -1) {
        rej(`Your package version (${pkgVers}) has a SemVer value that falls before your latest tag (${latestTag}).\n`);
      }

      if (!formattedCommits[0].tag) {
        out += `\n## ${pkgVers === latestTag ? "Latest" : pkgVers} (${getToday()})\n\n`;
      }

      res(formattedCommits);
    });
  });
}

function getToday() {
  let date = new Date();

  return `${date.getFullYear()}-${prepend0(date.getMonth() + 1)}-${prepend0(date.getDate())}`;
}

function prepend0(val) {
  return (val < 10 ? "0" + val : val);
}

function prepareOutput(formattedCommits) {
  formattedCommits.forEach(commit => {
    if (commit.tag) {
      out += `\n## ${commit.tag} (${commit.date})\n\n`;
    }

    if (commit.indent) {
      out += "  ";
    }

    if (commitURI) {
      out += `- [${commit.subject}](${commitURI + commit.hash})\n`;
    } else {
      out += `- ${commit.subject}\n`;
    }
  });

  return Promise.resolve();
}

function save() {
  return new Promise((res, rej) => {
    fs.writeFile("./CHANGELOG.md", out, err => {
      if (err) {
        rej(err);
      }

      res();
    });
  });
}
