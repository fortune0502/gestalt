// @flow
// scaffolds a new gestalt project

import fs from 'fs';
import path from 'path';
import prompt from 'prompt';
import rimraf from 'rimraf';
import ejs from 'ejs';
import {get, exec, copy} from './cli';
import {invariant} from 'gestalt-utils';
import {snake, camel} from 'change-case';
import {version} from '../package.json';

export default async function(name: string): Promise {
  try {
    invariant(
      name.match(/^[$A-Z_][0-9A-Z_$]*$/i),
      `"${name}" is not a valid name for a project. Please use a valid ` +
      'identifier name (alphanumeric).'
    );

    const root = path.resolve(name);
    const projectName = path.basename(root);

    prompt.start();

    // ask for confirmation if overwriting an existing directory
    if (fs.existsSync(root)) {
      const {yesno} = await get({
        name: 'yesno',
        message: `Directory ${name} already exists. Continue? [yes/no]`,
        validator: /y[es]*|n[o]?/,
        warning: 'Must respond yes or no',
        default: 'no',
      });

      if (yesno[0] === 'y') {
        console.log(`Overwriting files in ${name}`);
        rimraf.sync(root);
      } else {
        console.log('Project initialization canceled');
        process.exit();
      }
    }

    // ask for necessary config information
    const config = await get({
      properties: {
        databaseAdapter: {
          message: 'what database adapter should this project use?',
          default: 'gestalt-postgres',
        },
      },
    });
    config.databaseAdapterFn = camel(config.databaseAdapter);

    // ask for database adapter specific config
    // TODO: we should require this from the adapter package
    const databaseAdapterConfigProperties = {
      'gestalt-postgres': {
        databaseURL: {
          message: 'what is the url to your database?',
          default: `postgres://localhost/${snake(name)}`
        },
      },
    };
    if (databaseAdapterConfigProperties[config.databaseAdapter] != null) {
      config.databaseAdapterConfig = await get({
        properties: databaseAdapterConfigProperties[config.databaseAdapter]
      });
    }

    console.log(`Creating a new Gestalt project in ${root}...`);

    if (!fs.existsSync(root)) {
      fs.mkdirSync(root);
    }

    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({
        name: projectName,
        version: '0.0.1',
        private: true,
        scripts: {
          start: 'node server.js'
        },
      }, null, 2)
    );

    process.chdir(root);

    console.log('Installing gestalt packages from npm...');

    console.log(
      await exec(
        'npm install --save --save-exact express ' +
        `gestalt-server@${version} ${config.databaseAdapter}@${version}`
      )
    );

    console.log('Copying files...');

    // create directories
    fs.mkdirSync(path.join(root, 'objects'));
    fs.mkdirSync(path.join(root, 'mutations'));

    // copy static files
    await Promise.all(
      [
        'schema.graphql',
        'objects/session.js',
        'mutations/.gitkeep'
      ].map(
        fileName => copy(
          path.join(__dirname, '../template', fileName),
          path.join(root, fileName),
        )
      )
    );

    // copy server.js with interpolated values
    fs.writeFileSync(
      path.join(root, 'server.js'),
      ejs.render(
        fs.readFileSync(
          path.join(__dirname, '../template/server.js.ejs'),
          'utf8',
        ),
        config
      )
    );

  } catch (err) {
    console.log('gestalt init failed with the error:', err);
    throw err;
  }

  prompt.stop();
}
