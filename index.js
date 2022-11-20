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

    console.log("------jsonData-------")
    console.log(json)

    return {
        json: json,
        length: chunkLength,
    }
}

const getAttribute = (jsonData, buffer, offset, i, type) => {
    let result = []
    let index = -1
    let stride = 4

    if (type == "POSITION") {
        index = jsonData.json.meshes[i].primitives[0].attributes.POSITION

    } else if (type == "NORMAL") {
        index = jsonData.json.meshes[i].primitives[0].attributes.NORMAL

    } else if (type == "TANGENT") {
        index = jsonData.json.meshes[i].primitives[0].attributes.TANGENT

    } else if (type == "TEXCOORD_0") {
        index = jsonData.json.meshes[i].primitives[0].attributes.TEXCOORD_0

    } else if (type == "WEIGHTS_0") {
        index = jsonData.json.meshes[i].primitives[0].attributes.WEIGHTS_0

    } else if (type == "JOINTS_0") {
        index = jsonData.json.meshes[i].primitives[0].attributes.JOINTS_0
        stride = 1

    } else if (type == "indices") {
        index = jsonData.json.meshes[i].primitives[0].indices
        stride = 2
    }

    if (index == undefined || null) { return [] }

    const accessors = jsonData.json.accessors[index]
    const view = jsonData.json.bufferViews[Number(accessors.bufferView)]
    const vtx = new DataView(buffer, offset + GLB_CHUNK_HEADER_SIZE + view.byteOffset, view.byteLength)

    for (let i = 0; i < view.byteLength; i += stride) {
        if (stride == 4) {
            result.push(vtx.getFloat32(i, LE))

        } else if (stride == 1) {
            result.push(vtx.getUint8(i, LE))

        } else if (stride == 2) {
            result.push(vtx.getUint16(i, LE))
        }
    }

    return result
}

const getTexture = (jsonData, buffer, offset, i, type) => {
    const material = jsonData.json.materials[jsonData.json.meshes[i].primitives[0].material]
    let index = null

    if (type == "albedo") {
        if (!material.pbrMetallicRoughness) {
            return null
        }

        index = material.pbrMetallicRoughness.baseColorTexture.index

    } else if (type == "normal") {
        if (!material.normalTexture) {
            return null
        }

        index = material.normalTexture.index
    }

    if (index == undefined || null) { return null }

    const view = jsonData.json.bufferViews[jsonData.json.images[index].bufferView]

    const imgBuf = new Uint8Array(
        buffer,
        offset + GLB_CHUNK_HEADER_SIZE + view.byteOffset,
        view.byteLength
    )

    const img = new Image()
    img.src = URL.createObjectURL(new Blob([imgBuf]))

    return img.src
}

const getSkins = (jsonData, buffer, offset, i) => {
    if (!jsonData.json.skins) {
        return null

    } else if (!jsonData.json.skins[i].joints) {
        return null
    }

    let invMatrix = [], bones = []

    const skin = jsonData.json.skins[i]
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

const parseGLB = (raw) => {
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
            id: i,
            attributes: {
                pos: getAttribute(jsonData, ds.buffer, offset, i, "POSITION"),
                inx: getAttribute(jsonData, ds.buffer, offset, i, "indices"),
                nor: getAttribute(jsonData, ds.buffer, offset, i, "NORMAL"),
                tan: getAttribute(jsonData, ds.buffer, offset, i, "TANGENT"),
                uv: getAttribute(jsonData, ds.buffer, offset, i, "TEXCOORD_0"),
                bon: getAttribute(jsonData, ds.buffer, offset, i, "JOINTS_0"),
                wei: getAttribute(jsonData, ds.buffer, offset, i, "WEIGHTS_0")
            },
            textures: {
                albedo: getTexture(jsonData, ds.buffer, offset, i, "albedo"),
                normal: getTexture(jsonData, ds.buffer, offset, i, "normal")
            },
            skins: getSkins(jsonData, ds.buffer, offset, i),
        })
    }

    console.log("------parsedData-------")
    console.log(meshes)
    return meshes
}

export default parseGLB