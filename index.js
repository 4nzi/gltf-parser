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
    const accessors = jsonData.json.accessors[index]

    const view = jsonData.json.bufferViews[Number(accessors.bufferView)]
    let position = []

    const vtx = new DataView(buffer, offset + GLB_CHUNK_HEADER_SIZE + view.byteOffset, view.byteLength)
    for (let i = 0; i < view.byteLength; i += 4) {
        position.push(vtx.getFloat32(i, LE))
    }

    return position
}

const getIndices = (jsonData, buffer, offset, meshIndex) => {
    const index = jsonData.json.meshes[meshIndex].primitives[0].indices
    const accessors = jsonData.json.accessors[index]

    const view = jsonData.json.bufferViews[Number(accessors.bufferView)]

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
    const accessors = jsonData.json.accessors[index]

    const view = jsonData.json.bufferViews[Number(accessors.bufferView)]

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
    const accessors = jsonData.json.accessors[index]

    const view = jsonData.json.bufferViews[Number(accessors.bufferView)]

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

const getBoneIndices = (jsonData, buffer, offset, meshIndex) => {
    if (!jsonData.json.meshes[meshIndex].primitives[0].attributes.JOINTS_0) {
        return []
    }

    const index = jsonData.json.meshes[meshIndex].primitives[0].attributes.JOINTS_0
    const accessors = jsonData.json.accessors[index]

    const view = jsonData.json.bufferViews[Number(accessors.bufferView)]

    let boneIndices = []
    const vtx = new DataView(buffer, offset + GLB_CHUNK_HEADER_SIZE + view.byteOffset, view.byteLength)
    for (let i = 0; i < view.byteLength; i += 1) {
        boneIndices.push(vtx.getUint8(i, LE))
    }

    return boneIndices
}

const getWeights = (jsonData, buffer, offset, meshIndex) => {
    if (!jsonData.json.meshes[meshIndex].primitives[0].attributes.WEIGHTS_0) {
        return []
    }

    const index = jsonData.json.meshes[meshIndex].primitives[0].attributes.WEIGHTS_0
    const accessors = jsonData.json.accessors[index]

    const view = jsonData.json.bufferViews[Number(accessors.bufferView)]

    let weights = []
    const vtx = new DataView(buffer, offset + GLB_CHUNK_HEADER_SIZE + view.byteOffset, view.byteLength)
    for (let i = 0; i < view.byteLength; i += 4) {
        weights.push(vtx.getFloat32(i, LE))
    }

    return weights
}

const getSkins = (jsonData, buffer, offset, meshIndex) => {
    let invMatrix = [], bones = []

    const skin = jsonData.json.skins[meshIndex]
    const index = skin.inverseBindMatrices
    const accessors = jsonData.json.accessors[index]
    const view = jsonData.json.bufferViews[Number(accessors.bufferView)]
    const vtx = new DataView(buffer, offset + GLB_CHUNK_HEADER_SIZE + view.byteOffset, view.byteLength)


    // get invMatrix from buffer
    for (let i = 0; i < view.byteLength; i += 4) {
        invMatrix.push(vtx.getFloat32(i, LE))
    }

    // get bone data and push result
    skin.joints.forEach((joint, i) => {
        const node = jsonData.json.nodes[joint]

        bones.push({
            id: joint,
            jointInx: i,
            name: node.name || null,
            position: node.translation || null,
            scale: node.scale || null,
            rotation: node.rotation || null,
            children: node.children || null,
            invMatrix: invMatrix.splice(0, 16) || null,
        })
    })
    return bones
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
            attributes: {
                pos: getPosition(jsonData, ds.buffer, offset, i),
                inx: getIndices(jsonData, ds.buffer, offset, i),
                nor: getNormal(jsonData, ds.buffer, offset, i),
                uv: getTexCoord(jsonData, ds.buffer, offset, i),
                bon: getBoneIndices(jsonData, ds.buffer, offset, i),
                wei: getWeights(jsonData, ds.buffer, offset, i),
            },
            textures: {
                albedo: getTexture(jsonData, ds.buffer, offset, i),
            },
            skins: getSkins(jsonData, ds.buffer, offset, i),
        })
    }

    return meshes
}