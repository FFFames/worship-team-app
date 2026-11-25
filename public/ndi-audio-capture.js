/** Sends stereo tab audio to the desktop publisher in 10 ms planar blocks. */

const blockSamples = 480

class NdiAudioCapture extends AudioWorkletProcessor {
  block = new Float32Array(blockSamples * 2)
  position = 0

  process(inputs, outputs) {
    const [left, right = left] = inputs[0]
    const frames = outputs[0][0].length
    for (let index = 0; index < frames; index++) {
      this.block[this.position] = left?.[index] ?? 0
      this.block[blockSamples + this.position] = right?.[index] ?? 0
      this.position++
      if (this.position === blockSamples) {
        this.port.postMessage(this.block.buffer, [this.block.buffer])
        this.block = new Float32Array(blockSamples * 2)
        this.position = 0
      }
    }
    return true
  }
}

registerProcessor('worshipteam-ndi-capture', NdiAudioCapture)
