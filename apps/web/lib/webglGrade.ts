import { WEBGL_FRAGMENT_SHADER, WEBGL_VERTEX_SHADER, toUniforms, type GradeParams } from "@lumen/core";

/**
 * Runs the Lumen grading shader in WebGL — the same grading math the mobile
 * app runs through Skia. One renderer (one GL context) can be reused for
 * many images so the page never hits the browser's context limit.
 */
export class GradeRenderer {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private texture: WebGLTexture;
  private locations = new Map<string, WebGLUniformLocation | null>();

  constructor(canvas: HTMLCanvasElement = document.createElement("canvas")) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl", { preserveDrawingBuffer: true, premultipliedAlpha: false });
    if (!gl) throw new Error("WebGL is not available in this browser");
    this.gl = gl;

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(`Shader compile failed: ${gl.getShaderInfoLog(shader)}`);
      }
      return shader;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, WEBGL_VERTEX_SHADER));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, WEBGL_FRAGMENT_SHADER));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Shader link failed: ${gl.getProgramInfoLog(program)}`);
    }
    gl.useProgram(program);
    this.program = program;

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    this.texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }

  private loc(name: string) {
    if (!this.locations.has(name)) this.locations.set(name, this.gl.getUniformLocation(this.program, name));
    return this.locations.get(name)!;
  }

  /** Draw `source` graded with `params` into this renderer's canvas at the given size. */
  render(source: TexImageSource, params: GradeParams, width: number, height: number, mirror = false) {
    const gl = this.gl;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.uniform1i(this.loc("u_mirror"), mirror ? 1 : 0);
    for (const [name, value] of Object.entries(toUniforms(params))) {
      if (Array.isArray(value)) gl.uniform3f(this.loc(name), value[0]!, value[1]!, value[2]!);
      else gl.uniform1f(this.loc(name), value as number);
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  toBlob(type = "image/jpeg", quality = 0.92): Promise<Blob> {
    return new Promise((resolve, reject) =>
      this.canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Encoding failed"))), type, quality),
    );
  }
}

let shared: GradeRenderer | null | undefined;

/** A lazily created renderer shared by every gallery tile. `null` if WebGL is unavailable. */
export function sharedRenderer(): GradeRenderer | null {
  if (shared === undefined) {
    try {
      shared = new GradeRenderer();
    } catch {
      shared = null;
    }
  }
  return shared;
}
