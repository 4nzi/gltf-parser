# gltf-paresr

A minimal, JavaScript glTF(glb) Parser, Parses to a JavaScript Object.

## Parsed results

```javascript
[
    {
        id:Number,

        attribute: {
            inx: Array
            nor: Array
            tan: Array
            pos: Array
            uv:  Array
            bon: Array
            wei: Array
        },

        texture: {
            albedo: String
            normal: String
        },

        skins: {
            id:        Number
            jointInx:  Number
            name:      String
            position:  Array
            scale:     Array
            rotation:  Array
            children:  Array
        },

        animations: Array,
        
        scene: {
            translation: vec3,
            rotation: vec4,
            scale: vec3
        },
    }, ...
]    
```