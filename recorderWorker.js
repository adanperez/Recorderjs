var recLength = 0,
  recBuffers = [],
  sampleRate,
  numChannels;

this.onmessage = function (e) {
  switch (e.data.command) {
    case 'init':
      init(e.data.config);
      break;
    case 'record':
      record(e.data.buffer);
      break;
    case 'exportWAV':
      exportWAV(e.data.type, e.data.customSamplingRate);
      break;
    case 'getBuffer':
      getBuffer();
      break;
    case 'clear':
      clear();
      break;
  }
};

function init(config) {
  sampleRate = config.sampleRate;
  numChannels = config.numChannels;
  initBuffers();
}

function record(inputBuffer) {
  for (var channel = 0; channel < numChannels; channel++) {
    recBuffers[channel].push(inputBuffer[channel]);
  }
  recLength += inputBuffer[0].length;
}

function exportWAV(type, customSamplingRate) {
  var buffers = [];
  for (var channel = 0; channel < numChannels; channel++) {
    var buffer = mergeBuffers(recBuffers[channel], recLength);
    if (customSamplingRate) {
      buffer = interpolateArray(buffer, customSamplingRate, sampleRate);
    }
    buffers.push(buffer);
  }
  if (numChannels === 2) {
    var interleaved = interleave(buffers[0], buffers[1]);
  } else {
    var interleaved = buffers[0];
  }
  var dataview = encodeWAV(interleaved, customSamplingRate);
  var audioBlob = new Blob([dataview], { type: type });
  this.postMessage(audioBlob);
}

function getBuffer() {
  var buffers = [];
  for (var channel = 0; channel < numChannels; channel++) {
    buffers.push(mergeBuffers(recBuffers[channel], recLength));
  }
  this.postMessage(buffers);
}

function clear() {
  recLength = 0;
  recBuffers = [];
  initBuffers();
}

function initBuffers() {
  for (var channel = 0; channel < numChannels; channel++) {
    recBuffers[channel] = [];
  }
}

function mergeBuffers(recBuffers, recLength) {
  var result = new Float32Array(recLength);
  var offset = 0;
  for (var i = 0; i < recBuffers.length; i++) {
    result.set(recBuffers[i], offset);
    offset += recBuffers[i].length;
  }
  return result;
}

function interleave(inputL, inputR) {
  var length = inputL.length + inputR.length;
  var result = new Float32Array(length);

  var index = 0,
    inputIndex = 0;

  while (index < length) {
    result[index++] = inputL[inputIndex];
    result[index++] = inputR[inputIndex];
    inputIndex++;
  }
  return result;
}

function floatTo16BitPCM(output, offset, input) {
  for (var i = 0; i < input.length; i++, offset += 2) {
    var s = Math.max(-1, Math.min(1, input[i]));
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
}

function writeString(view, offset, string) {
  for (var i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function encodeWAV(samples, customSampleRate) {
  var buffer = new ArrayBuffer(44 + samples.length * 2);
  var view = new DataView(buffer);

  /* RIFF identifier */
  writeString(view, 0, 'RIFF');
  /* RIFF chunk length */
  view.setUint32(4, 36 + samples.length * 2, true);
  /* RIFF type */
  writeString(view, 8, 'WAVE');
  /* format chunk identifier */
  writeString(view, 12, 'fmt ');
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (raw) */
  view.setUint16(20, 1, true);
  /* channel count */
  view.setUint16(22, numChannels, true);
  /* sample rate */
  view.setUint32(24, customSampleRate || sampleRate, true);
  /* byte rate (sample rate * block align) */
  view.setUint32(28, customSampleRate || sampleRate * 4, true);
  /* block align (channel count * bytes per sample) */
  view.setUint16(32, numChannels * 2, true);
  /* bits per sample */
  view.setUint16(34, 16, true);
  /* data chunk identifier */
  writeString(view, 36, 'data');
  /* data chunk length */
  view.setUint32(40, samples.length * 2, true);

  floatTo16BitPCM(view, 44, samples);

  return view;
}

// From https://github.com/Mido22/tmp1
function interpolateArray(data, newSampleRate, oldSampleRate) {
  var fitCount = Math.round(data.length * (newSampleRate / oldSampleRate));
  var newData = new Array();
  var springFactor = new Number((data.length - 1) / (fitCount - 1));
  newData[0] = data[0]; // for new allocation
  for (var i = 1; i < fitCount - 1; i++) {
    var tmp = i * springFactor;
    var before = new Number(Math.floor(tmp)).toFixed();
    var after = new Number(Math.ceil(tmp)).toFixed();
    var atPoint = tmp - before;
    newData[i] = this.linearInterpolate(data[before], data[after], atPoint);
  }
  newData[fitCount - 1] = data[data.length - 1]; // for new allocation
  return newData;
}

function linearInterpolate(before, after, atPoint) {
  return before + (after - before) * atPoint;
}