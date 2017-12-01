var base64 = require('base64-js');
var pako = require('pako');
var sax = require('sax');
var fs = require('fs');

module.exports = class JsMzml {
  constructor(filename) {
    this.filename = filename;
    this.isFinished = true;
  }

  // The following code is heavily based on https://github.com/cheminfo-js/mzML
  // Changes have been made to suit my use case
  retrieve(options) {
    var options = options || {};
    var level = options.level || "Both";
    var rtBegin = options.rtBegin || 0;
    var rtEnd = options.rtEnd || 9999999999;

    this.isFinished = false;
    var spectra = {};
    var entry = {};
    var currentId;
    var kind;
    var nextValue;
    var readRaw;
    var bitType;
    var isCompressed;
    var currentIndex = 1;

    var self = this;

    var parser = sax.parser(true, {trim: true});

    parser.onopentag = function(node) {
      readRaw = node.name === 'binary';

      switch (node.name) {
        case 'mzML':
          kind = 'mzML';
          break;
        case 'spectrum':
          if (node.attributes.id) {
            if (Object.keys(entry).length > 0) {
              if (entry.msLevel === level || level === 'Both') {
                if (entry.time <= rtEnd && entry.time >= rtBegin) {
                  spectra[currentIndex] = Object.assign({}, entry);
                  currentIndex++;
                  entry = {};                  
                }
              }
            }
            currentId = node.attributes.id;
            entry.currentId = currentId;
          }
          break;
        case 'chromatogram':
          currentId = undefined;
          break;
        case 'cvParam':
          switch (node.attributes.name) {
              case 'm/z array':
                nextValue = 'MASS';
                break;
              case 'intensity array':
                nextValue = 'INTENSITY';
                break;
              case 'scan start time':
                entry.time = parseFloat(node.attributes.value);
                break;
              case '64-bit float':
                bitType = '64';
                break;
              case '32-bit float':
                bitType = '32';
                break;
              case 'zlib compression':
                isCompressed = true;
                break;
              case 'no compression':
                isCompressed = false;
                break;
              case 'ms level':
                entry.msLevel = node.attributes.value;
                break;
              default:
                nextValue = null;
                break;
          }
          break;
      }
    };

    parser.ontext = function(raw) {
      if (readRaw && currentId) {
        if (nextValue === 'MASS') {
          entry.mass = self.decodeData(raw, bitType, isCompressed);
        } else if (nextValue === 'INTENSITY') {
          entry.intensity = self.decodeData(raw, bitType, isCompressed);
        }
        nextValue = null;
      }
    };

    parser.onend = function() {
      self.isFinished = true;
    };

    parser.onerror = function(err) {
      self.isFinished = true;
    };

    //var data = fs.readFileSync(this.filename);
    //parser.write(data).close();
    var stream = fs.createReadStream(this.filename);
    parser = sax.createStream(true, {trim: true});
    stream.pipe(parser);
    return spectra;
  }

  decodeData(raw, bitType, isCompressed) {
    var array = [];
    var buffer = base64.toByteArray(raw);
    if (isCompressed === true) {
      buffer = pako.inflate(buffer);
    }
    if (bitType === '32') {
      return new Float32Array(buffer.buffer);
    }
    else if (bitType === '64') {      
      return new Float64Array(buffer.buffer);
    }
    else {
      return [];
    }
    return [];
  }

}