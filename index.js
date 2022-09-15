const LE = true // Binary GLTF is little endian.
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
    let version = dataView.getUint32(offset, LE)
    return version
}

const getTotalLength = (dataView) => {
    const offset = 8
    let length = dataView.getUint32(offset, LE)
    return length
}

const getGLBMeta = (dataView) => {
    let magic = getMagic(dataView)
    let version = getVersion(dataView)
    let total = getTotalLength(dataView)

    return {
        magic: magic,
        version: version,
        total: total,
    }
}

const getJSONData = (dataView) => {
    const offset = GLB_FILE_HEADER_SIZE
    let chunkLength = dataView.getUint32(offset, LE)
    let chunkType = dataView.getUint32(offset + GLB_CHUNK_LENGTH_SIZE, LE)

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

const getPosition = (jsonData, buffer, offset) => {
    let index = jsonData.json.meshes[0].primitives[0].attributes.POSITION

    const view = jsonData.json.bufferViews[index]
    let position = []

    let vtx = new DataView(buffer, offset + GLB_CHUNK_HEADER_SIZE + view.byteOffset, view.byteLength)
    for (var i = 0; i < view.byteLength; i += 4) {
        position.push(vtx.getFloat32(i, LE))
    }

    return position
}

const getIndices = (jsonData, buffer, offset) => {
    let index = jsonData.json.meshes[0].primitives[0].indices

    const view = jsonData.json.bufferViews[index]
    let indices = []

    let vtx = new DataView(buffer, offset + GLB_CHUNK_HEADER_SIZE + view.byteOffset, view.byteLength)
    for (var i = 0; i < view.byteLength; i += 2) {
        indices.push(vtx.getUint16(i, LE))
    }

    return indices
}

const getNormal = (jsonData, buffer, offset) => {
    if (!jsonData.json.meshes[0].primitives[0].attributes.NORMAL) {
        return []
    }

    let index = jsonData.json.meshes[0].primitives[0].attributes.NORMAL

    const view = jsonData.json.bufferViews[index]
    let normal = []

    let vtx = new DataView(buffer, offset + GLB_CHUNK_HEADER_SIZE + view.byteOffset, view.byteLength)
    for (var i = 0; i < view.byteLength; i += 4) {
        normal.push(vtx.getFloat32(i, LE))
    }

    return normal
}

const getTexCoord = (jsonData, buffer, offset) => {
    if (!jsonData.json.meshes[0].primitives[0].attributes.TEXCOORD_0) {
        return []
    }

    let index = jsonData.json.meshes[0].primitives[0].attributes.TEXCOORD_0

    const view = jsonData.json.bufferViews[index]
    let uv = []

    let vtx = new DataView(buffer, offset + GLB_CHUNK_HEADER_SIZE + view.byteOffset, view.byteLength)
    for (var i = 0; i < view.byteLength; i += 4) {
        uv.push(vtx.getFloat32(i, LE))
    }

    return uv
}

export const parseGLB = (raw) => {
    let ds = new DataView(raw)

    let glbMeta = getGLBMeta(ds)
    console.log("magic " + glbMeta.magic.toString(16))

    if (glbMeta.magic !== MAGIC_glTF) {
        console.warn("This file is not a GLB file.")
        return;
    }

    const jsonData = getJSONData(ds)

    const offset = (GLB_FILE_HEADER_SIZE + GLB_CHUNK_HEADER_SIZE) + jsonData.length
    let dataChunkType = ds.getUint32(offset + GLB_CHUNK_LENGTH_SIZE, LE)

    if (dataChunkType !== GLB_CHUNK_TYPE_BIN) {
        console.warn("This GLB file doesn't have a binary buffer.")
        return
    }

    const atributes = {
        pos: getPosition(jsonData, ds.buffer, offset),
        inx: getIndices(jsonData, ds.buffer, offset),
        nor: getNormal(jsonData, ds.buffer, offset),
        uv: getTexCoord(jsonData, ds.buffer, offset)
    }

    console.log(jsonData)
    console.log(atributes)

    return atributes
}