const Drawing = function(canvas) {
  /** @type {WebGLRenderingContext} */
  const gl = canvas.getContext('webgl')
  const Telement = document.getElementById('T')

  //const textures = getTextures(gl)

  const hexagonPoints = []
  for (let i = 0; i < 6; ++i) {
    const angle = (i / 6) * 2 * Math.PI
    hexagonPoints.push([Math.sin(angle), Math.cos(angle)])
  }

  const scale = 1 / 100

  const COLOR_DEEP_WALLS = colour(0, 50, 100)
  const COLOR_PILLARS = colour(0, 80, 230)
  const COLOR_SMALL_WALLS = colour(0, 100, 255)
  const COLOR_GROUND = colour(20, 60, 170)
  const COLOR_DOOR = colour(255, 0, 0)
  const COLOR_DOOR_SIDE = colour(100, 100, 100)

  const sprites = {
    player: {},
    ghost: {},
    pad: {}
  }

  function build() {
    const vertices = []
    const normals = []
    const colors = []
    const indices = []

    const topNormal = [0, 1, 0]

    const vertexMap = new Map()

    const getVertex = (xyz, color, normal = topNormal) => {
      const key = JSON.stringify([xyz, color, normal])
      let result = vertexMap.get(key)
      if (result === undefined) {
        result = vertexMap.size
        vertexMap.set(key, result)
        vertices.push(-xyz[0] * scale, xyz[1] * scale, xyz[2] * scale)
        colors.push(color[0], color[1], color[2])
        normals.push(normal[0], normal[1], normal[2])
      }
      return result
    }

    const makeTriangle = (v0, v1, v2, c) => {
      const U = Vec3.sub(v1, v0)
      const V = Vec3.sub(v2, v0)
      const normal = Vec3.cross(U, V)
      indices.push(getVertex(v0, c, normal), getVertex(v1, c, normal), getVertex(v2, c, normal))
    }

    const makeQuad = (v0, v1, v2, v3, c) => {
      makeTriangle(v0, v1, v3, c)
      makeTriangle(v1, v2, v3, c)
    }

    const makePolygon = (vec2s, y, color) => {
      const a = vec2s[0]
      let b = vec2s[1]
      for (let i = 2, c; i < vec2s.length; ++i, b = c) {
        c = vec2s[i]
        makeTriangle([a[0], y, a[1]], [b[0], y, b[1]], [c[0], y, c[1]], color)
      }
    }

    const makePolygonWithWalls = (pts, y0, y1, c, c2 = c) => {
      makePolygon(pts, y0, c)
      let a = pts[0]
      for (let i = 1, b; i <= pts.length; ++i, a = b) {
        b = pts[i % 6]
        makeQuad([a[0], y1, a[1]], [b[0], y1, b[1]], [b[0], y0, b[1]], [a[0], y0, a[1]], c2)
      }
    }

    const makeHexagon = (centerX, centerZ, radius, y0, y1, c, c2) => {
      makePolygonWithWalls(hexagonPoints.map(p => [p[0] * radius + centerX, p[1] * radius + centerZ]), y0, y1, c, c2)
    }

    //b and t are each 4 vertexes, anticlockwise (when looking from above) for bottom and top of the shape
    const makeFrustrum = (b, t, c, c2) => {
      //makeQuad(...b, c)
      makeQuad(...t, c)
      makeQuad(b[0], b[1], t[1], t[0], c2 || c)
      makeQuad(b[0], t[0], t[3], b[3], c2 || c)
      makeQuad(b[3], t[3], t[2], b[2], c2 || c)
      makeQuad(b[2], t[2], t[1], b[1], c2 || c)
    }

    for (const level of levels) {
      level.ibStart = indices.length

      const walls = level.walls
      for (const poly of walls) {
        for (let i = 0; i < poly.length; ++i) {
          const poly0 = poly[i]
          const poly1 = poly[(i + 1) % poly.length]

          const a = new Vec2(poly0.x, poly0.y)
          const b = new Vec2(poly1.x, poly1.y)

          const segmentLength = Math.hypot(b.x - a.x, b.y - a.y)
          if (segmentLength === 0) {
            continue
          }

          const xlen = a.x - b.x
          const zlen = a.y - b.y

          const nx = -zlen / segmentLength
          const nz = xlen / segmentLength

          const width = 5
          const topY = -10
          const bottomY = 1
          const deepdown = 1000

          // deep down
          makeQuad(
            [a.x, deepdown, a.y],
            [b.x, deepdown, b.y],
            [b.x, bottomY, b.y],
            [a.x, bottomY, a.y],
            COLOR_DEEP_WALLS
          )

          const offset = new Vec2(nx, nz).mul(width / 2)
          const border = [a.sub(offset), b.sub(offset), b.add(offset), a.add(offset)]
          makeFrustrum(
            [
              [border[0].x, bottomY, border[0].y],
              [border[1].x, bottomY, border[1].y],
              [border[2].x, bottomY, border[2].y],
              [border[3].x, bottomY, border[3].y]
            ],
            [
              [border[0].x, topY, border[0].y],
              [border[1].x, topY, border[1].y],
              [border[2].x, topY, border[2].y],
              [border[3].x, topY, border[3].y]
            ],
            COLOR_SMALL_WALLS
          )

          makeHexagon(a.x, a.y, 6, topY - 2, deepdown, COLOR_PILLARS)
        }
      }

      for (const pts of level.polys) {
        const a = pts[0]
        let b = pts[1]
        for (let i = 2; i < pts.length; ++i) {
          const c = pts[i]
          makeTriangle([a.x, 1, a.y], [b.x, 1, b.y], [c.x, 1, c.y], COLOR_GROUND)
          b = c
        }
      }

      for (const d of level.doors) {
        for (let i = 0, p = d.polygon; i < 2; ++i) {
          makeHexagon(p[i].x, p[i].y, 5, -22, 1, COLOR_DOOR_SIDE)
        }
      }

      level.ibCount = indices.length - level.ibStart

      for (const door of level.doors) {
        const p = door.polygon
        const p0 = new Vec2(p[0].x, p[0].y)
        const p1 = new Vec2(p[1].x, p[1].y)
        const normal = p1.sub(p0).normal()
        const offset = normal.mul(1)
        const border = [p0.sub(offset), p1.sub(offset), p1.add(offset), p0.add(offset)]
        door.ibStart = indices.length
        for (let i = 0; i < 2; ++i) {
          const bottomY = -4 - i * 10
          const topY = -6 - i * 10
          makeFrustrum(
            [
              [border[0].x, bottomY, border[0].y],
              [border[1].x, bottomY, border[1].y],
              [border[2].x, bottomY, border[2].y],
              [border[3].x, bottomY, border[3].y]
            ],
            [
              [border[0].x, topY, border[0].y],
              [border[1].x, topY, border[1].y],
              [border[2].x, topY, border[2].y],
              [border[3].x, topY, border[3].y]
            ],
            COLOR_DOOR
          )
        }
        door.ibCount = indices.length - door.ibStart
      }
    }

    sprites.player.ibStart = indices.length
    makeTriangle([0, -1, -10], [-6, -1, 5], [6, -1, 5], [1, 0, 0])
    sprites.player.ibCount = indices.length - sprites.player.ibStart

    sprites.ghost.ibStart = indices.length
    makeTriangle([0, -1, -10], [-6, -1, 5], [6, -1, 5], [0, 0, 0])
    sprites.ghost.ibCount = indices.length - sprites.ghost.ibStart

    sprites.pad.ibStart = indices.length
    makeHexagon(0, 0, 25, -4, 0.1, [1, 1, 1], [0.5, 0.5, 0.5])
    sprites.pad.ibCount = indices.length - sprites.pad.ibStart

    return {
      vertices: new Float32Array(vertices),
      normals: new Float32Array(normals),
      colors: new Float32Array(colors),
      indices: new Uint16Array(indices)
    }
  }

  const built = build()

  const createGlBuffer = (items, type = gl.ARRAY_BUFFER) => {
    const result = gl.createBuffer()
    gl.bindBuffer(type, result)
    gl.bufferData(type, items, gl.STATIC_DRAW)
    return result
  }

  const vertex_buffer = createGlBuffer(built.vertices)
  const normal_buffer = createGlBuffer(built.normals)
  const colors_buffer = createGlBuffer(built.colors)
  const index_buffer = createGlBuffer(built.indices, gl.ELEMENT_ARRAY_BUFFER)

  const canvasWidth = canvas.clientWidth
  const canvasHeight = canvas.clientHeight

  let cameraRotX = 1
  let cameraRotY = 0
  const cameraPos = [0, -1, 2]

  const viewMatrix = new Float32Array(16)
  const projectionMatrix = new Float32Array(16)
  const playerLightPosition = new Float32Array(3)
  calcProjectionMatrix()

  const createGlShasder = (program, input, type) => {
    const shader = gl.createShader(type)
    gl.shaderSource(shader, input)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.log(`Shader compilation failed: ${gl.getShaderInfoLog(shader)}`)
    }
    gl.attachShader(program, shader)
  }

  const shaderProgram = gl.createProgram()
  createGlShasder(shaderProgram, shader_basic_vert, gl.VERTEX_SHADER)
  createGlShasder(shaderProgram, shader_basic_frag, gl.FRAGMENT_SHADER)
  gl.linkProgram(shaderProgram)

  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(shaderProgram))
  }

  /* ====== Associating attributes to vertex shader =====*/
  const uPmatrix = gl.getUniformLocation(shaderProgram, 'Pmatrix')
  const uVmatrix = gl.getUniformLocation(shaderProgram, 'Vmatrix')
  const uPosition = gl.getAttribLocation(shaderProgram, 'position')
  const uNormal = gl.getAttribLocation(shaderProgram, 'normal')
  const uColor = gl.getAttribLocation(shaderProgram, 'color')
  const uPlayerLightPosition = gl.getUniformLocation(shaderProgram, 'playerLightPosition')
  const uTranslation = gl.getUniformLocation(shaderProgram, 'inTranslation')
  const uAmbientColor = gl.getUniformLocation(shaderProgram, 'inAmbientColor')
  const uSurfaceSensitivity = gl.getUniformLocation(shaderProgram, 'inSurfaceSensitivity')

  this.scale = 1.5

  this.accumulator = 0

  const interpolate = (position, movementVector) => {
    return position.sub(movementVector.mul(1 - Settings.tps * this.accumulator))
  }

  this.setCamera = (position, movementVector) => {
    const camera = interpolate(position, movementVector)

    playerLightPosition[0] = -camera.x * scale
    playerLightPosition[2] = camera.y * scale

    cameraPos[0] = -camera.x * scale
    cameraPos[1] = -1 - this.scale
    cameraPos[2] = 1 + camera.y * scale
  }

  this.bg = () => {
    calcViewMatrix()

    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LEQUAL)
    gl.clearColor(0, 0, 0, 1)
    gl.clearDepth(1.0)

    gl.viewport(0.0, 0.0, canvasWidth, canvasHeight)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
  }

  this.timer = time => {
    const r = 255
    const b = Math.floor(255 * (1 - time / Settings.timeToDie))

    // TODO:
    Telement.innerText = time.toFixed(1)
    //ctx.fillStyle = `rgb(${r},${b},${b})`
    //ctx.font = '48px serif'
    //ctx.fillText(time.toFixed(1), 10, 40)
  }

  let timeDelta = 1

  const playerRotation = (p, vector) => {
    const a = vector ? Math.atan2(-vector.y, vector.x) : 0
    return Math.PI / 2 - (p._r = angleLerp(p._r !== undefined ? p._r : a, a, timeDelta * 12))
  }

  this.player = player => {
    const pos = interpolate(player.position, player.movementVector)
    calcViewMatrix()
    mat4Translate(viewMatrix, -pos.x * scale, -0.03, pos.y * scale)
    mat4RotateY(viewMatrix, playerRotation(player, player.drawMovementVector))
    gl.uniformMatrix4fv(uVmatrix, false, viewMatrix)
    gl.uniform3f(uAmbientColor, 1, 1, 1)
    gl.drawElements(gl.TRIANGLES, sprites.player.ibCount, gl.UNSIGNED_SHORT, sprites.player.ibStart * 2)
  }

  this.ghost = ghost => {
    if (ghost.dead) {
      return false
    }
    const pos = interpolate(ghost.position, ghost.movementVector)
    calcViewMatrix()
    mat4Translate(viewMatrix, -pos.x * scale, -0.01, pos.y * scale)
    mat4RotateY(viewMatrix, playerRotation(ghost, ghost.movementVector))
    gl.uniformMatrix4fv(uVmatrix, false, viewMatrix)
    gl.drawElements(gl.TRIANGLES, sprites.ghost.ibCount, gl.UNSIGNED_SHORT, sprites.ghost.ibStart * 2)
    return true
  }

  let endLight
  let currentLevelId
  const levelState = new Map()

  this.level = (level, frameTime, currentTimeDelta) => {
    timeDelta = currentTimeDelta
    if (level.id !== currentLevelId) {
      currentLevelId = level.id
      endLight = 0
      timeDelta = 1
      levelState.clear()
    }

    gl.enable(gl.CULL_FACE)
    gl.cullFace(gl.BACK)

    gl.useProgram(shaderProgram)

    gl.uniform3f(uTranslation, 0, 0, 0)
    gl.uniform3f(uAmbientColor, 1, 1, 1)
    gl.uniformMatrix4fv(uPmatrix, false, projectionMatrix)
    gl.uniformMatrix4fv(uVmatrix, false, viewMatrix)
    gl.uniform3fv(uPlayerLightPosition, playerLightPosition)
    gl.uniform1f(uSurfaceSensitivity, 1)

    gl.bindBuffer(gl.ARRAY_BUFFER, vertex_buffer)

    gl.vertexAttribPointer(uPosition, 3, gl.FLOAT, false, 0, 0)
    gl.enableVertexAttribArray(uPosition)

    gl.bindBuffer(gl.ARRAY_BUFFER, normal_buffer)
    gl.vertexAttribPointer(uNormal, 3, gl.FLOAT, true, 0, 0)
    gl.enableVertexAttribArray(uNormal)

    gl.bindBuffer(gl.ARRAY_BUFFER, colors_buffer)
    gl.vertexAttribPointer(uColor, 3, gl.FLOAT, false, 0, 0)
    gl.enableVertexAttribArray(uColor)

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, index_buffer)

    gl.drawElements(gl.TRIANGLES, level.ibCount, gl.UNSIGNED_SHORT, level.ibStart * 2)

    for (const d of level.doors) {
      if (!d.open) {
        gl.drawElements(gl.TRIANGLES, d.ibCount, gl.UNSIGNED_SHORT, d.ibStart * 2)
      }
    }

    gl.uniform1f(uSurfaceSensitivity, 0.4)

    gl.uniform3f(uTranslation, -level.start.x * scale, scale, level.start.y * scale)
    gl.uniform3f(uAmbientColor, 0.1, 0, 0.5)
    gl.drawElements(gl.TRIANGLES, sprites.pad.ibCount, gl.UNSIGNED_SHORT, sprites.pad.ibStart * 2)

    gl.uniform3f(uTranslation, -level.end.x * scale, 3 * scale, level.end.y * scale)
    endLight = lerp(endLight, lerp(0.7, 1, 1 - Math.abs(Math.cos(frameTime * 1.5))), timeDelta * 4)
    gl.uniform3f(uAmbientColor, 0, endLight / 1.3, endLight)
    gl.drawElements(gl.TRIANGLES, sprites.pad.ibCount, gl.UNSIGNED_SHORT, sprites.pad.ibStart * 2)

    for (const s of level.switches) {
      const { uid, pressed } = s
      let state = levelState.get(uid)
      if (!state) {
        levelState.set(uid, (state = { r: 1, g: 0, p: 0 }))
      }

      const { r, g, p } = state
      state.r = lerp(r, pressed ? 0.1 : lerp(0.7, 1, 1 - Math.abs(Math.cos(frameTime * 3))), timeDelta * 4)
      state.g = lerp(g, pressed ? 0.3 : 0, timeDelta * 5)
      state.p = lerp(state.p, pressed ? 3.8 * scale : 0, timeDelta * 8)

      gl.uniform1f(uSurfaceSensitivity, g)

      gl.uniform3f(uTranslation, -s.x * scale, p, s.y * scale)
      gl.uniform3f(uAmbientColor, r, g, 0)
      gl.drawElements(gl.TRIANGLES, sprites.pad.ibCount, gl.UNSIGNED_SHORT, sprites.pad.ibStart * 2)
    }

    gl.uniform1f(uSurfaceSensitivity, 0)
    gl.uniform3f(uTranslation, 0, 0, 0)
  }

  this.titleScreen = () => {}

  this.endScreen = () => {}

  function calcViewMatrix(out = viewMatrix) {
    out.set(mat4Identity)
    mat4RotateX(out, cameraRotX)
    mat4RotateY(out, cameraRotY)
    mat4RotateZ(out, -Math.PI)
    mat4Translate(out, -cameraPos[0], -cameraPos[1], -cameraPos[2])
  }

  function calcProjectionMatrix() {
    const zMin = 0.1
    const zMax = 100
    const a = canvasWidth / canvasHeight
    const angle = 40
    const ang = Math.tan((angle * 0.5 * Math.PI) / 180) //angle*.5
    projectionMatrix[0] = 0.5 / ang
    projectionMatrix[5] = (0.5 * a) / ang
    projectionMatrix[10] = -(zMax + zMin) / (zMax - zMin)
    projectionMatrix[11] = -1
    projectionMatrix[14] = (-2 * zMax * zMin) / (zMax - zMin)
  }

  function init() {
    let pointerLocked = false

    canvas.addEventListener('mousemove', e => {
      if (pointerLocked) {
        const camRotSpeed = 0.01
        cameraRotY += (e.movementX || 0) * camRotSpeed
        if (cameraRotY < 0) {
          cameraRotY += Math.PI * 2
        }
        if (cameraRotY >= Math.PI * 2) {
          cameraRotY -= Math.PI * 2
        }
        cameraRotX += (e.movementY || 0) * camRotSpeed
        if (cameraRotX < -Math.PI * 0.5) {
          cameraRotX = -Math.PI * 0.5
        }
        if (cameraRotX > Math.PI * 0.5) {
          cameraRotX = Math.PI * 0.5
        }
      }
    })

    canvas.addEventListener('mousedown', e => {
      if (e.button === 0) {
        if (!pointerLocked) {
          canvas.requestPointerLock()
        }
      } else {
        document.exitPointerLock()
      }
    })

    document.addEventListener(
      'pointerlockchange',
      () => {
        pointerLocked = document.pointerLockElement === canvas
      },
      false
    )
  }

  init()
}
