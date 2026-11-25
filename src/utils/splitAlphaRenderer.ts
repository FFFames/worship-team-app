/** Renders a packed video frame with the mask half as transparency. */

import type { VideoAlphaMode } from '../types/media'

type Renderer = {
  draw: (video: HTMLVideoElement, mode: VideoAlphaMode) => void
  dispose: () => void
}

function frameSize(video: HTMLVideoElement, mode: VideoAlphaMode) {
  return {
    width: mode === 'side-by-side' ? Math.floor(video.videoWidth / 2) : video.videoWidth,
    height: mode === 'top-bottom' ? Math.floor(video.videoHeight / 2) : video.videoHeight,
  }
}

const vertexSource = `
attribute vec2 position;
varying vec2 uv;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
  uv = vec2(position.x * 0.5 + 0.5, 0.5 - position.y * 0.5);
}`
const fragmentSource = `
precision highp float;
uniform sampler2D packedVideo;
uniform vec2 packedSize;
uniform vec2 fillSize;
uniform vec2 maskOrigin;
varying vec2 uv;
void main() {
  vec2 pixel = clamp(uv * fillSize, vec2(0.5), fillSize - vec2(0.5));
  vec3 fill = texture2D(packedVideo, pixel / packedSize).rgb;
  float alpha = texture2D(packedVideo, (pixel + maskOrigin) / packedSize).r;
  gl_FragColor = vec4(fill * alpha, alpha);
}`

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('สร้างตัวประมวลผลภาพไม่ได้')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader
  gl.deleteShader(shader)
  throw new Error('เบราว์เซอร์เปิดตัวประมวลผลวิดีโอไม่ได้')
}

function webGLRenderer(canvas: HTMLCanvasElement, gl: WebGLRenderingContext): Renderer {
  const program = gl.createProgram()
  const quad = gl.createBuffer()
  const texture = gl.createTexture()
  const dispose = () => {
    gl.deleteTexture(texture)
    gl.deleteBuffer(quad)
    gl.deleteProgram(program)
  }
  if (!program || !quad || !texture) {
    dispose()
    throw new Error('พื้นที่ประมวลผลวิดีโอไม่พอ')
  }

  let vertex: WebGLShader | undefined
  let fragment: WebGLShader | undefined
  try {
    vertex = compile(gl, gl.VERTEX_SHADER, vertexSource)
    fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource)
    gl.attachShader(program, vertex)
    gl.attachShader(program, fragment)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('เชื่อมตัวประมวลผลวิดีโอไม่ได้')
  } catch (cause) {
    dispose()
    throw cause
  } finally {
    if (fragment) gl.deleteShader(fragment)
    if (vertex) gl.deleteShader(vertex)
  }

  gl.useProgram(program)
  gl.bindBuffer(gl.ARRAY_BUFFER, quad)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  const position = gl.getAttribLocation(program, 'position')
  gl.enableVertexAttribArray(position)
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.uniform1i(gl.getUniformLocation(program, 'packedVideo'), 0)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  const packedSize = gl.getUniformLocation(program, 'packedSize')
  const fillSize = gl.getUniformLocation(program, 'fillSize')
  const maskOrigin = gl.getUniformLocation(program, 'maskOrigin')
  const maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number

  return {
    draw(video, mode) {
      const { width, height } = frameSize(video, mode)
      if (!width || !height) return
      if (video.videoWidth > maxSize || video.videoHeight > maxSize) throw new Error('วิดีโอมีขนาดเกินที่ตัวประมวลผลรองรับ')
      if (canvas.width !== width) canvas.width = width
      if (canvas.height !== height) canvas.height = height
      gl.viewport(0, 0, width, height)
      gl.uniform2f(packedSize, video.videoWidth, video.videoHeight)
      gl.uniform2f(fillSize, width, height)
      gl.uniform2f(maskOrigin, mode === 'side-by-side' ? width : 0, mode === 'top-bottom' ? height : 0)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    },
    dispose,
  }
}

function canvasRenderer(canvas: HTMLCanvasElement): Renderer {
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('เบราว์เซอร์เปิดตัวประมวลผลวิดีโอไม่ได้')
  return {
    draw(video, mode) {
      const { width, height } = frameSize(video, mode)
      if (!width || !height) return
      // Limit readback on machines without WebGL while keeping the original aspect ratio.
      const scale = Math.min(1, 1280 / width, 720 / height)
      const w = Math.max(1, Math.round(width * scale))
      const h = Math.max(1, Math.round(height * scale))
      if (canvas.width !== w) canvas.width = w
      if (canvas.height !== h) canvas.height = h
      context.clearRect(0, 0, w, h)
      context.drawImage(video, mode === 'side-by-side' ? width : 0, mode === 'top-bottom' ? height : 0, width, height, 0, 0, w, h)
      const mask = context.getImageData(0, 0, w, h).data
      context.clearRect(0, 0, w, h)
      context.drawImage(video, 0, 0, width, height, 0, 0, w, h)
      const pixels = context.getImageData(0, 0, w, h)
      for (let index = 0; index < mask.length; index += 4) pixels.data[index + 3] = mask[index]
      context.putImageData(pixels, 0, 0)
    },
    dispose() { canvas.width = 0 },
  }
}

export function createSplitAlphaRenderer(canvas: HTMLCanvasElement): Renderer {
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, depth: false, antialias: false })
  return gl ? webGLRenderer(canvas, gl) : canvasRenderer(canvas)
}
