const LE = true
const MAGIC_glTF = 0x676c5446
const GLB_FILE_HEADER_SIZE = 12
const GLB_CHUNK_LENGTH_SIZE = 4
const GLB_CHUNK_TYPE_SIZE = 4
const GLB_CHUNK_HEADER_SIZE = GLB_CHUNK_LENGTH_SIZE + GLB_CHUNK_TYPE_SIZE
const GLB_CHUNK_TYPE_JSON = 0x4e4f534a
const GLB_CHUNK_TYPE_BIN = 0x004e4942

const getMagic = (dataView) => {
    const offset = 0
    return dataView.getUint32(offset)
}

const getVersion = (dataView) => {
    const offset = 4
    const version = dataView.getUint32(offset, LE)
    return version
}

const getTotalLength = (dataView) => {
    const offset = 8
    const length = dataView.getUint32(offset, LE)
    return length
}

const getGLBMeta = (dataView) => {
    const magic = getMagic(dataView)
    const version = getVersion(dataView)
    const total = getTotalLength(dataView)

    return {
        magic: magic,
        version: version,
        total: total,
    }
}

const getJSONData = (dataView) => {
    const offset = GLB_FILE_HEADER_SIZE
    const chunkLength = dataView.getUint32(offset, LE)
    const chunkType = dataView.getUint32(offset + GLB_CHUNK_LENGTH_SIZE, LE)

    if (chunkType !== GLB_CHUNK_TYPE_JSON) {
        console.warn("This GLB file doesn't have a JSON part.")
        return
    }

    const jsonChunk = new Uint8Array(dataView.buffer, offset + GLB_CHUNK_HEADER_SIZE, chunkLength)
    const decoder = new TextDecoder("utf8")
    const jsonText = decoder.decode(jsonChunk)
    const json = JSON.parse(jsonText)

    return {
        json: json,
        length: chunkLength,
    }
}

const getPosition = (jsonData, buffer, offset, meshIndex) => {
    const index = jsonData.json.meshes[meshIndex].primitives[0].attributes.POSITION

    const view = jsonData.json.bufferViews[index]
    let position = []

    const vtx = new DataView(buffer, offset + GLB_CHUNK_HEADER_SIZE + view.byteOffset, view.byteLength)
    for (let i = 0; i < view.byteLength; i += 4) {
        position.push(vtx.getFloat32(i, LE))
    }

    return position
}

const getIndices = (jsonData, buffer, offset, meshIndex) => {
    const index = jsonData.json.meshes[meshIndex].primitives[0].indices
    const view = jsonData.json.bufferViews[index]

    let indices = []
    const vtx = new DataView(buffer, offset + GLB_CHUNK_HEADER_SIZE + view.byteOffset, view.byteLength)
    for (let i = 0; i < view.byteLength; i += 2) {
        indices.push(vtx.getUint16(i, LE))
    }

    return indices
}

const getNormal = (jsonData, buffer, offset, meshIndex) => {
    if (!jsonData.json.meshes[meshIndex].primitives[0].attributes.NORMAL) {
        return []
    }

    const index = jsonData.json.meshes[meshIndex].primitives[0].attributes.NORMAL
    const view = jsonData.json.bufferViews[index]

    let normal = []
    const vtx = new DataView(buffer, offset + GLB_CHUNK_HEADER_SIZE + view.byteOffset, view.byteLength)
    for (let i = 0; i < view.byteLength; i += 4) {
        normal.push(vtx.getFloat32(i, LE))
    }

    return normal
}

const getTexCoord = (jsonData, buffer, offset, meshIndex) => {
    if (!jsonData.json.meshes[meshIndex].primitives[0].attributes.TEXCOORD_0) {
        return []
    }

    const index = jsonData.json.meshes[meshIndex].primitives[0].attributes.TEXCOORD_0
    const view = jsonData.json.bufferViews[index]

    let uv = []
    const vtx = new DataView(buffer, offset + GLB_CHUNK_HEADER_SIZE + view.byteOffset, view.byteLength)
    for (let i = 0; i < view.byteLength; i += 4) {
        uv.push(vtx.getFloat32(i, LE))
    }

    return uv
}

const getTexture = (jsonData, buffer, offset, meshIndex) => {
    let index = -1

    if (jsonData.json.images) {
        index = jsonData.json.images[meshIndex].bufferView
    }

    if (index === -1) {
        console.warn("Texture field was not found.")
        return ""
    }

    const view = jsonData.json.bufferViews[index]

    const imgBuf = new Uint8Array(
        buffer,
        offset + GLB_CHUNK_HEADER_SIZE + view.byteOffset,
        view.byteLength
    )

    const img = new Image()
    img.src = URL.createObjectURL(new Blob([imgBuf]))

    return img.src
}

export const parseGLB = (raw) => {
    const ds = new DataView(raw)
    const glbMeta = getGLBMeta(ds)
    let meshes = []

    if (glbMeta.magic !== MAGIC_glTF) {
        console.warn("This file is not a GLB file.")
        return
    }

    const jsonData = getJSONData(ds)
    const offset = (GLB_FILE_HEADER_SIZE + GLB_CHUNK_HEADER_SIZE) + jsonData.length
    const dataChunkType = ds.getUint32(offset + GLB_CHUNK_LENGTH_SIZE, LE)

    if (dataChunkType !== GLB_CHUNK_TYPE_BIN) {
        console.warn("This GLB file doesn't have a binary buffer.")
        return
    }

    for (let i in jsonData.json.meshes) {
        meshes.push({
            pos: getPosition(jsonData, ds.buffer, offset, i),
            inx: getIndices(jsonData, ds.buffer, offset, i),
            nor: getNormal(jsonData, ds.buffer, offset, i),
            uv: getTexCoord(jsonData, ds.buffer, offset, i),
            tex: getTexture(jsonData, ds.buffer, offset, i)
        })
    }

    return meshes
}