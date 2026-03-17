const fs = require('fs');
const path = require('path');
const asset = fs.readFileSync(__dirname + '/asset.txt', 'utf8');
const asset2 = fs.readFileSync(path.join(__dirname, 'asset.txt'), 'utf8');
const asset3 = fs.promises.readFile(__dirname + '/asset.txt', 'utf8');
const asset4 = fs.existsSync(__dirname + '/asset.txt');
const asset5 = fs.statSync(__dirname + '/asset.txt');
const asset6 = fs.realpathSync(__dirname + '/asset.txt');
const asset7 = fs.openSync(__dirname + '/asset.txt', 'r');
const asset8 = path.resolve(__dirname, 'asset.txt');
fs.readFileSync(asset8);
const asset9 = path.relative(__dirname, __dirname + '/asset.txt');
const asset10 = path.dirname(__dirname + '/asset.txt');
const asset11 = path.basename(__dirname + '/asset.txt');
const asset12 = path.extname(__dirname + '/asset.txt');

require('./other.js');
import('./dynamic.js');
// Force emission of other.js as asset if it's not being picked up as dependency
fs.readFileSync(__dirname + '/other.js');
fs.readFileSync(__dirname + '/dynamic.js');
