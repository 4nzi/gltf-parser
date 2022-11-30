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
    const mesh = jsonData.json.meshes[i].primitives[0]
    let result = []
    let index = null
    let stride = 4

    switch (type) {
        case "POSITION":
            index = mesh.attributes.POSITION
            break

        case "NORMAL":
            index = mesh.attributes.NORMAL
            break

        case "TANGENT":
            index = mesh.attributes.TANGENT
            break

        case "TEXCOORD_0":
            index = mesh.attributes.TEXCOORD_0
            break

        case "WEIGHTS_0":
            index = mesh.attributes.WEIGHTS_0
            break

        case "JOINTS_0":
            index = mesh.attributes.JOINTS_0
            stride = 1
            break

        case "indices":
            index = mesh.indices
            stride = 2
            break

        default:
            console.warn("Invalid type.")
            return
    }

    if (index == undefined || null) { return }

    const accessors = jsonData.json.accessors[index]
    const view = jsonData.json.bufferViews[Number(accessors.bufferView)]
    const vtx = new DataView(buffer, offset + GLB_CHUNK_HEADER_SIZE + view.byteOffset, view.byteLength)

    for (let i = 0; i < view.byteLength; i += stride) {
        switch (stride) {
            case 4: result.push(vtx.getFloat32(i, LE)); break
            case 2: result.push(vtx.getUint16(i, LE)); break
            case 1: result.push(vtx.getUint8(i, LE)); break
        }
    }

    return result
}

const getTexture = (jsonData, buffer, offset, i, type) => {
    const material = jsonData.json.materials[jsonData.json.meshes[i].primitives[0].material]
    let index = null

    if (material == null || undefined) { return }

    switch (type) {
        case "albedo":
            if (!material.pbrMetallicRoughness.baseColorTexture) return
            index = material.pbrMetallicRoughness.baseColorTexture.index
            break

        case "normal":
            if (!material.normalTexture) return
            index = material.normalTexture.index
            break

        default:
            console.warn("Invalid type.")
            return
    }

    if (index == undefined || null) { return }

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

const getSkins = (jsonData, i) => {
    const skinInx = jsonData.json.nodes.find(node => node.mesh == i).skin

    if (skinInx == null || undefined) { return }

    const skin = jsonData.json.skins[skinInx]
    const nodes = jsonData.json.nodes
    let result = []
    let stack = [], node, itm, parInx

    stack.push([skin.joints[0], null])

    while (stack.length > 0) {
        itm = stack.pop()
        node = nodes[itm[0]]

        result.push({
            jointNum: skin.joints.indexOf(itm[0]),
            name: node.name || null,
            position: node.translation || null,
            scale: node.scale || null,
            rotation: node.rotation || null,
            parent: itm[1],
            nodeIdx: itm[0],
        })

        parInx = result.length - 1

        if (node.children != undefined) {
            for (i = 0; i < node.children.length; i++) stack.push([node.children[i], parInx])
        }
    }

    return result
}

const getAnimations = (jsonData, buffer, offset, i) => {
    const anim = jsonData.json.animations
    const nodes = jsonData.json.nodes

    if (anim === undefined || anim.length == 0) return
    if (!jsonData.json.animations[i]) return

    let result = []
    let chPtr, nPtr, sPtr, joint
    let tData = []
    let vData = []

    for (let ich in anim[i].channels) {
        chPtr = anim[i].channels[ich]
        if (chPtr.target.node == undefined) continue

        nPtr = nodes[chPtr.target.node]
        if (nPtr.name === undefined) {
            console.log("node is not a joint or doesn't have a name")
            continue
        }

        //Get sample data
        sPtr = anim[i].samplers[chPtr.sampler]
        const inputAcc = jsonData.json.accessors[sPtr.input]
        const outputAcc = jsonData.json.accessors[sPtr.output]

        const iView = jsonData.json.bufferViews[Number(inputAcc.bufferView)]
        const tVtx = new DataView(buffer, offset + GLB_CHUNK_HEADER_SIZE + iView.byteOffset, iView.byteLength)

        for (let i = 0; i < iView.byteLength; i += 4) {
            tData.push(tVtx.getFloat32(i, LE))
        }

        const vView = jsonData.json.bufferViews[Number(outputAcc.bufferView)]
        const vVtx = new DataView(buffer, offset + GLB_CHUNK_HEADER_SIZE + vView.byteOffset, vView.byteLength)

        for (let i = 0; i < vView.byteLength; i += 4) {
            vData.push(vVtx.getFloat32(i, LE))
        }

        if (!result[nPtr.name]) joint = result[nPtr.name] = {}
        else joint = result[nPtr.name]

        let samples = []
        joint[chPtr.target.path] = { interp: sPtr.interpolation, samples: samples }

        for (let i = 0; i < inputAcc.count; i++) {
            let ii = i * 4
            samples.push({ t: tData[i], v: vData.slice(ii, ii + 4) })
        }

        tData = []
        vData = []
    }

    return result
}

const getScene = (jsonData, i) => {
    const node = jsonData.json.nodes.find(node => node.mesh == i)

    const result = {
        translation: node.translation || [0, 0, 0],
        rotation: node.rotation || [0, 0, 0],
        scale: node.scale || [1, 1, 1]
    }

    return result
}

const parseGLB = (raw) => {
    const ds = new DataView(raw)
    const glbMeta = getGLBMeta(ds)
    let result = []

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
        result.push({
            id: i,
            attribute: {
                pos: getAttribute(jsonData, ds.buffer, offset, i, "POSITION"),
                inx: getAttribute(jsonData, ds.buffer, offset, i, "indices"),
                nor: getAttribute(jsonData, ds.buffer, offset, i, "NORMAL"),
                tan: getAttribute(jsonData, ds.buffer, offset, i, "TANGENT"),
                uv: getAttribute(jsonData, ds.buffer, offset, i, "TEXCOORD_0"),
                bon: getAttribute(jsonData, ds.buffer, offset, i, "JOINTS_0"),
                wei: getAttribute(jsonData, ds.buffer, offset, i, "WEIGHTS_0")
            },
            texture: {
                albedo: getTexture(jsonData, ds.buffer, offset, i, "albedo"),
                normal: getTexture(jsonData, ds.buffer, offset, i, "normal")
            },
            skins: getSkins(jsonData, i),
            animations: getAnimations(jsonData, ds.buffer, offset, i),
            scene: getScene(jsonData, i),
        })
    }

    return result
}

export default parseGLB