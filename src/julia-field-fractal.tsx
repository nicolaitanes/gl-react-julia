import { Node, GLSL, Shaders } from "gl-react";
import { useMemo } from "react";

export interface JuliaFieldFractalProps {
    center: [number, number];
    zoom: number;
    /** Julia constant: [real, imaginary] */
    c: [number, number];
    /** Julia power, also available in `fieldExpr` */
    p: number;
    /** Julia power at fieldExpr 0, also available in `fieldExpr` */
    q: number;
    /** Julia power at fieldExpr 1, also available in `fieldExpr` */
    r: number;
    /** URL, data URL, or other valid texture source */
    image: string;
    /**
     * glsl expression invoked each iteration to adjust the power `p`.
     *
     * Available ingredients include `p`, `q`, and `r` along with anything already present in the shader; e.g.
     * `uv`, `c`, `z`, `z0`, `lastZ`, `rgb`, `hsv`, `i`, `mag2i`, and even `glFragColor`.
     *
     * The result of `fieldExpr` is interpreted as a proportion of `r` vs `q`:
     *   p = q + (r-q)*fieldExpr
     */
    fieldExpr?: string;
    maxIterations?: number;
}

const fullExtent = [5, 4];

/**
 * Image-sampling pseudo-Julia set fragment shader for use with gl-react --
 * the power `p` varies in a field f(z, c, hsv, ...) that is sampled at each iteration,
 * individually for each point.
 *
 * Visualizes `z = z^p + c` for points `z` in the complex plane between leftBottom and rightTop,
 * by picking up a little of the color under `z` at each iteration and applying to z0,
 * and recalculating `p` before each iteration.
 */
 export function JuliaFieldFractal(props: JuliaFieldFractalProps) {
    const { center, zoom, c, p, q, r, image, fieldExpr, maxIterations } = props;
    // The shader gets recompiled when `fieldExpr` or `maxIterations` change
    const shaders = useMemo(() => Shaders.create({
        shader: {
            frag: GLSL`
precision highp float;
varying vec2 uv;
uniform vec2 center;
uniform float zoom;
uniform vec2 c;
uniform float p0;
uniform float q;
uniform float r;
uniform sampler2D image;

// Quadrant-aware
float atan2(float y, float x) {
    float s = (abs(x) > abs(y)) ? 1.0 : 0.0;
    return mix(3.14159265358979/2.0 - atan(x,y), atan(y,x), s);
}

// All coordinates in [0..1]
vec3 hsv2rgb(vec3 c)
{
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

// All coordinates in [0..1]
vec3 rgb2hsv(vec3 c)
{
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = c.g < c.b ? vec4(c.bg, K.wz) : vec4(c.gb, K.xy);
    vec4 q = c.r < p.x ? vec4(p.xyw, c.r) : vec4(c.r, p.yzx);

    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

void main() {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    vec2 zRange = zoom * vec2(${fullExtent[0].toFixed(8)}, ${fullExtent[1].toFixed(8)});
    vec2 leftBottom = center - .5 * zRange;
    vec2 z = (leftBottom + uv * zRange);
    vec2 z0 = z;
    vec2 lastZ = z;

    // More than 64 iterations are usually imperceptible at GPU resolution
    int iter = ${(maxIterations || 64) + 1};
    for (int i=0; i<${maxIterations || 64}; ++i) {
        // convert to zoomed-out source image coordinates and sample the color
        vec2 uvNow = z * vec2(.2, .25) + vec2(.5, .5);
        vec3 rgb = texture2D(image, uvNow).rgb;

        // Add a bit of the color, less if z is further from 0
        float mag2i = .35 * dot(z, z);
        mag2i = clamp(1.0 / max(1.0, mag2i), 0.0, 1.0);
        gl_FragColor.rgb += .01*mix(gl_FragColor.rgb, rgb, mag2i);

        // Modify the power with the fieldExpr function
        float p = p0;
        ${fieldExpr
            ? ('vec3 hsv = rgb2hsv(rgb);  p = q + (r-q)*(' + fieldExpr + ');')
            : ''
        }

        // Make this iteration's z value available for next iteration's fieldExpr function
        lastZ = z;

        // z = z^p + c
        if (p == 2.0) {
            float nextR = dot(z, z*vec2(1.0,-1.0)); // (z.x*z.x) - (z.y*z.y);
            z = c + vec2(nextR, 2.0*z.x*z.y);
        } else {
            float scale = pow(dot(z,z), 0.5*p);
            float theta = p * atan2(z.y, z.x);
            z = c + vec2(scale*cos(theta), scale*sin(theta));
        }

        // stop early if it's already escaped the source image
        float magZ = dot(z, z);
        if (magZ > 10.0) {
            iter = i;
            break;
        }
    }

    if (iter == ${maxIterations || 64}) {
        // unescaped Julia set members get black
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    } else {
        // rescale the color, mainly based on how many iterations
        float fiter = log(dot(z,z));
        fiter = (fiter >= 0.0) ? (float(iter) - log(fiter) / log(2.0)) : (fiter + float(iter));
        float scale = (iter == 0) ? 100.0 : 1.0 / (.01 * float(iter));
        gl_FragColor *= vec4(scale, scale, scale, 1.0);
    }
}
                `
            }
        }), [fieldExpr, maxIterations])
    return <Node
        shader={shaders.shader}
        uniforms={{ center, zoom: 2**(-zoom), c, p0: p, q, r, image }}
    />;
}
