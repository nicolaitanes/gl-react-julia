import { Shaders, Node, GLSL } from "gl-react";

const fullExtent = [5, 4];

const shaders = Shaders.create({
    juliaFractal: {
        frag: GLSL`
precision highp float;
varying vec2 uv;
uniform vec2 center;
uniform float zoom;
uniform vec2 c;
uniform float p;

float atan2(float y, float x) {
    float s = (abs(x) > abs(y)) ? 1.0 : 0.0;
    return mix(3.14159265358979/2.0 - atan(x,y), atan(y,x), s);
}

vec3 hsv2rgb(vec3 c)
{
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
    vec2 zRange = zoom * vec2(${fullExtent[0].toFixed(8)}, ${fullExtent[1].toFixed(8)});
    vec2 leftBottom = center - .5 * zRange;
    vec2 z = (leftBottom + uv * zRange);
    vec2 lastZ = z;
    int iter = 65;

    for (int i=0; i<64; ++i) {
        if (p == 2.0) {
            float nextR = dot(z, z*vec2(1.0,-1.0)); // (z.x*z.x) - (z.y*z.y);
            z = c + vec2(nextR, 2.0*z.x*z.y);
        } else {
            float scale = pow(dot(z,z), 0.5*p);
            float theta = p * atan2(z.y, z.x);
            z = c + vec2(scale*cos(theta), scale*sin(theta));
        }

        if (length(z) > 4.0) {
            iter = i;
            break;
        }

        lastZ = z;
    }

    if (iter == 65) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    } else {
        float fiter = log(dot(z,z));
        fiter = (fiter >= 0.0) ? (float(iter) - log(fiter) / log(2.0)) : (fiter + float(iter));
        float striping = mod(fiter, 1.0) >= 0.5 ? 1.0 : 0.8;
        gl_FragColor = striping * vec4(hsv2rgb(vec3(fiter/64.0, .8, .8)), 1.0);
    }
}`
    }
});

export interface JuliaFractalProps {
    center: [number, number];
    zoom: number;
    c: [number, number];
    p: number;
}

/**
 * Basic Julia set fragment shader for use with gl-react.
 * Visualizes `z = z^p + c` for points `z` in the complex plane between leftBottom and rightTop,
 * primarily by varying the hue from 0/red/fast-escape to 360/violet/slow-escape.
 *
 * @param zoom as a power of 2; e.g. 0 is full-size, 1 is double magnification, ...
 */
export function JuliaFractal(props: JuliaFractalProps) {
    const { center, zoom, c, p } = props;
    return <Node shader={shaders.juliaFractal} uniforms={{ center, zoom: 2**(-zoom), c, p }} />;
}
