import type { VisualizerQualitySettings } from './visualizerQuality';
import {
  TRANSPORT_CONTROL_DEFINITIONS,
  TRANSPORT_DEFAULT_CONTROLS,
  type ReadonlyTransportControls,
  type TransportControlKey,
} from './visualizerTransportSchema';

export const TRANSPORT_MAX_IMPULSES = 8;

export interface TransportImpulse {
  readonly x: number;
  readonly y: number;
  readonly timeMs: number;
  readonly strength: number;
  readonly speed: number;
  readonly frequency: number;
  readonly decay: number;
  readonly tight: number;
}

export interface TransportVisualizerFrame {
  readonly timeMs: number;
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
  readonly seed: number;
  readonly controls: ReadonlyTransportControls;
  readonly impulses: readonly TransportImpulse[];
  readonly quality: VisualizerQualitySettings;
  readonly performanceTier?: TransportPerformanceTier;
}

export type TransportPerformanceTier = 'full' | 'balanced' | 'minimum';

export interface TransportPerformancePolicy {
  readonly tier: TransportPerformanceTier;
  readonly sceneScale: number;
  readonly maxOctaves: number;
  readonly maxSunTaps: number;
  readonly maxLayers: number;
  readonly maxLeafTiers: number;
  readonly maxApBars: number;
  readonly maxLeafCount: number;
  readonly maxBloom: number;
  readonly maxWaterLayering: number;
  readonly maxDispersion: number;
  readonly causticDetailScale: number;
}

export const TRANSPORT_PERFORMANCE_POLICY_FULL: TransportPerformancePolicy = Object.freeze({
  tier: 'full',
  sceneScale: 0.85,
  maxOctaves: 4,
  maxSunTaps: 12,
  maxLayers: 3,
  maxLeafTiers: 3,
  maxApBars: 4,
  maxLeafCount: Number.POSITIVE_INFINITY,
  maxBloom: Number.POSITIVE_INFINITY,
  maxWaterLayering: Number.POSITIVE_INFINITY,
  maxDispersion: Number.POSITIVE_INFINITY,
  causticDetailScale: 1,
});

export const TRANSPORT_PERFORMANCE_POLICY_BALANCED: TransportPerformancePolicy = Object.freeze({
  tier: 'balanced',
  sceneScale: 0.68,
  maxOctaves: 3,
  maxSunTaps: 7,
  maxLayers: 2,
  maxLeafTiers: 2,
  maxApBars: 2,
  maxLeafCount: Number.POSITIVE_INFINITY,
  maxBloom: 0.8,
  maxWaterLayering: 0,
  maxDispersion: 0,
  causticDetailScale: 1,
});

export const TRANSPORT_PERFORMANCE_POLICY_MINIMUM: TransportPerformancePolicy = Object.freeze({
  tier: 'minimum',
  sceneScale: 0.52,
  maxOctaves: 2,
  maxSunTaps: 5,
  maxLayers: 1,
  maxLeafTiers: 2,
  maxApBars: 1,
  maxLeafCount: 5,
  maxBloom: 0,
  maxWaterLayering: 0,
  maxDispersion: 0,
  causticDetailScale: 0.72,
});

export const TRANSPORT_PERFORMANCE_POLICIES: Readonly<Record<TransportPerformanceTier, TransportPerformancePolicy>> = Object.freeze({
  full: TRANSPORT_PERFORMANCE_POLICY_FULL,
  balanced: TRANSPORT_PERFORMANCE_POLICY_BALANCED,
  minimum: TRANSPORT_PERFORMANCE_POLICY_MINIMUM,
});

type RendererMode = 'webgl2' | 'canvas2d';

interface RenderTarget {
  readonly texture: WebGLTexture;
  readonly framebuffer: WebGLFramebuffer;
  readonly width: number;
  readonly height: number;
}

interface CompiledProgram {
  readonly program: WebGLProgram;
  readonly uniforms: Map<string, WebGLUniformLocation | null>;
}

export const TRANSPORT_VERTEX_SHADER = "#version 300 es\nin vec2 a_pos;out vec2 v_uv;void main(){v_uv=a_pos*.5+.5;gl_Position=vec4(a_pos,0.,1.);}";

export const TRANSPORT_SCENE_FRAGMENT_SHADER = "#version 300 es\nprecision highp float;in vec2 v_uv;out vec4 outColor;uniform vec2 u_res;uniform float u_time;uniform float u_medium,u_hybrid;uniform float u_fieldScale,u_octaves,u_churn,u_drift,u_hierarchy,u_flutter;uniform float u_aniso,u_direction,u_dirSpread,u_coverage,u_layers,u_parallax;uniform float u_swell,u_capillary;uniform float u_sunAngle,u_sunTaps,u_throwZ,u_ior,u_focusGain,u_foldClamp,u_dispersion,u_exposure;uniform float u_causticCoherence,u_causticScale,u_causticDetail,u_waterBrilliance,u_waterLayering;uniform float u_substrate,u_subScale,u_albedo,u_skyFill,u_warmth,u_tilt,u_fresnel;uniform float u_leafAmount,u_gapAmount,u_focusBreath,u_clusterSway,u_leafCount,u_leafSize,u_leafSoft,u_leafSway,u_leafVary,u_leafTiers,u_leafOpacity,u_leafDepth,u_leafStretch;uniform float u_apShape,u_apW,u_apH,u_apX,u_apY,u_apRot,u_apRadius,u_apSoft,u_apBars,u_apBarW,u_apSpill;uniform float u_foldType,u_foldBlend,u_segments,u_foldPhase,u_foldZoom,u_foldOffX,u_foldOffY,u_foldTwist;uniform vec4 u_imp[8];uniform vec4 u_impM[8];uniform int u_impCount;\nfloat hash13(vec3 p3){p3=fract(p3*.1031);p3+=dot(p3,p3.zyx+31.32);return fract((p3.x+p3.y)*p3.z);}float hash12(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}vec4 vnoise(vec3 x){vec3 i=floor(x),f=fract(x);vec3 u=f*f*f*(f*(f*6.-15.)+10.);vec3 du=30.*f*f*(f*(f-2.)+1.);float va=hash13(i+vec3(0,0,0)),vb=hash13(i+vec3(1,0,0)),vc=hash13(i+vec3(0,1,0)),vd=hash13(i+vec3(1,1,0)),ve=hash13(i+vec3(0,0,1)),vf=hash13(i+vec3(1,0,1)),vg=hash13(i+vec3(0,1,1)),vh=hash13(i+vec3(1,1,1));float k0=va,k1=vb-va,k2=vc-va,k3=ve-va,k4=va-vb-vc+vd,k5=va-vc-ve+vg,k6=va-vb-ve+vf,k7=-va+vb+vc-vd+ve-vf-vg+vh;float v=k0+k1*u.x+k2*u.y+k3*u.z+k4*u.x*u.y+k5*u.y*u.z+k6*u.z*u.x+k7*u.x*u.y*u.z;vec3 g=du*vec3(k1+k4*u.y+k6*u.z+k7*u.y*u.z,k2+k5*u.z+k4*u.x+k7*u.z*u.x,k3+k6*u.x+k5*u.y+k7*u.x*u.y);return vec4(v,g);}mat2 rot(float a){float s=sin(a),c=cos(a);return mat2(c,-s,s,c);} const float TAU=6.28318530718;\nvec3 fieldAtCore(vec2 p,float seed,float scaleMul,float rateMul,float detail){float t=u_time,h=0.,amp=1.,freq=1.,norm=0.;vec2 g=vec2(0.),warp=vec2(0.);int oct=int(u_octaves+.5);for(int i=0;i<4;i++){if(i>=oct)break;float fi=float(i),ang=u_direction+fi*u_dirSpread,sx=1.+u_aniso*3.2;mat2 M=mat2(1./sx,0.,0.,sx)*rot(ang)*(u_fieldScale*scaleMul*freq);vec2 adv=vec2(cos(ang),sin(ang))*(u_drift*t*(.3+fi*.22)),q=M*p+warp*(u_hierarchy*.85)+adv;float zt=t*(u_churn*rateMul*(.3+fi*.5)+.02)+u_flutter*fi*t*.85+seed*7.31+fi*13.7;vec4 n=vnoise(vec3(q,zt));float dw=i==0?1.:pow(max(detail,.001),fi),wa=amp*dw;h+=wa*(n.x*2.-1.);g+=wa*(transpose(M)*n.yz)*2.;warp=n.yz*1.8;norm+=wa;amp*=.58;freq*=2.13;}h*=1.85/max(norm,.001);g*=1.85/max(norm,.001);if(u_swell>.001)for(int k=0;k<2;k++){float a=u_direction+float(k)*1.93+.4;vec2 d=vec2(cos(a),sin(a));float w=u_fieldScale*scaleMul*(.5+float(k)*.37),sp=.5+float(k)*.33,ph=dot(p,d)*w-t*sp;h+=u_swell*.5*sin(ph);g+=u_swell*.5*cos(ph)*d*w;}if(u_capillary>.001){float w=u_fieldScale*scaleMul*8.5;vec4 n=vnoise(vec3(p*w,t*2.3+seed));float cap=u_capillary*.075*detail*detail;h+=cap*(n.x*2.-1.);g+=cap*n.yz*2.*w;}for(int k=0;k<8;k++){if(k>=u_impCount)break;vec4 im=u_imp[k],mm=u_impM[k];float age=u_time-im.z;if(age<0.||age>9.)continue;vec2 dv=p-im.xy;float r=length(dv)+1e-4,dr=r-age*mm.x,env=im.w*(1.-exp(-age*7.))*exp(-age*mm.z)*exp(-dr*dr*mm.w),ph=dr*mm.y;h+=env*sin(ph);float dhdr=env*(cos(ph)*mm.y-2.*dr*mm.w*sin(ph));g+=dhdr*(dv/r);}return vec3(h,g);}vec3 fieldAt(vec2 p,float seed,float scaleMul,float rateMul){return fieldAtCore(p,seed,scaleMul,rateMul,1.);}\nvec2 discTap(int k,int n,float rotJ){float fk=(float(k)+.5)/float(n),r=sqrt(fk),a=float(k)*2.39996323+rotJ;return vec2(cos(a),sin(a))*r;}\nfloat layerTransmission(int i,vec2 p,float rotJ){float fi=float(i),den=max(1.,u_layers-1.),zn=fi/den,z=mix(.34,1.,zn),sm=mix(1.35,.66,zn);vec2 off=vec2(cos(u_direction+fi),sin(u_direction+fi))*(u_parallax*z*.35);float r=u_sunAngle*z*u_throwZ*40./max(.5,u_fieldScale);int n=int(u_sunTaps+.5);float acc=0.;for(int k=0;k<12;k++){if(k>=n)break;vec2 s=p+off+discTap(k,n,rotJ)*r;vec3 f=fieldAt(s,fi*3.77,sm,1.);float hm=f.x*.5+.5,aa=.35*length(f.yz)*(r/max(float(n),3.))+.006;acc+=smoothstep(u_coverage-aa,u_coverage+aa,hm);}return acc/float(n);}\nfloat transmission(vec2 p,float rotJ){if(u_coverage<.02)return 1.;float T=1.;int L=int(u_layers+.5);for(int i=0;i<3;i++){if(i>=L)break;float op=.94-float(i)*.14;T*=mix(1.,layerTransmission(i,p,rotJ),op);}return T;}\n\nfloat projectedDiscTier(vec2 p,float cells,float size,float soft,float op,float sway,float seed,float mode){vec2 g=p*cells,id=floor(g);float t=1.,m=0.;for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){vec2 c=id+vec2(float(i),float(j));float h1=hash13(vec3(c,seed+1.7)),h2=hash13(vec3(c,seed+5.3)),h3=hash13(vec3(c,seed+9.1)),h4=hash13(vec3(c,seed+15.7));if(mode>0.&&h4<.58)continue;vec2 ctr=c+.5+(vec2(h1,h2)-.5)*(.95*u_leafVary);float ph=(h1+h2)*6.28318530718+u_time*(.16+h3*.26)*sway;ctr+=vec2(cos(ph),sin(ph*1.27))*(.26*sway);if(u_clusterSway>.001){vec2 cid=floor(c*.5);float c1=hash13(vec3(cid,seed+21.1)),c2=hash13(vec3(cid,seed+27.4));ctr+=vec2(cos(u_time*(.10+c1*.08)+c1*6.28318530718),sin(u_time*(.08+c2*.07)+c2*6.28318530718))*(.22*u_clusterSway);}vec2 q=g-ctr;if(u_leafStretch>.001){q=rot(h3*6.28318530718)*q;q.x/=1.+u_leafStretch*2.2;}float breathe=sin(u_time*(.08+h3*.10)+h4*6.28318530718)*u_focusBreath,rad=size*(.62+h3*.85*u_leafVary)*(1.+breathe*.24),sf=max(.012,soft*(.35+h1*1.1)*(1.+breathe*.75)),outside=smoothstep(-sf,sf,length(q)-rad),inside=1.-outside;t*=mix(1.,outside,op);m=max(m,inside*op);}return mode<0.?t:m;}\nfloat leaves(vec2 p){if(u_leafAmount<.004)return 1.;float t=1.;int tiers=int(u_leafTiers+.5);float den=max(1.,float(tiers)-1.);for(int i=0;i<3;i++){if(i>=tiers)break;float d=float(i)/den,k=u_leafDepth,cells=u_leafCount*mix(1.,1.+2.2*k,d),size=u_leafSize*mix(1.,1.-.15*k,d),soft=u_leafSoft*mix(1.,1.-.85*k,d),op=u_leafOpacity*mix(1.,1.-.88*k,d),sway=u_leafSway*mix(1.,1.+2.2*k,d);t*=projectedDiscTier(p,cells,size,soft,op,sway,float(i)*31.7,-1.);}return mix(1.,t,u_leafAmount);}\nfloat solarGaps(vec2 p){if(u_gapAmount<.004)return 0.;float m=0.;int tiers=int(u_leafTiers+.5);float den=max(1.,float(tiers)-1.);for(int i=0;i<3;i++){if(i>=tiers)break;float d=float(i)/den,k=u_leafDepth,cells=u_leafCount*mix(.52,1.25,d*k),size=u_leafSize*mix(.72,.36,d*k),soft=u_leafSoft*mix(1.35,.45,d*k),sway=(u_leafSway+.35*u_clusterSway)*mix(.55,1.25,d);m=max(m,projectedDiscTier(p,cells,size,soft,1.,sway,73.1+float(i)*29.7,1.));}return m*u_gapAmount;}\n\nfloat sdRoundBox(vec2 p,vec2 b,float r){vec2 d=abs(p)-b+r;return min(max(d.x,d.y),0.)+length(max(d,0.))-r;}\nfloat aperture(vec2 p){int s=int(u_apShape+.5);if(s==0)return 1.;vec2 b=vec2(u_apW,u_apH),q=rot(-u_apRot)*(p-vec2(u_apX,u_apY));float rad=min(u_apRadius,min(b.x,b.y)*.98),d;if(s==2){float m=min(b.x,b.y);d=length(q/b)*m-m;}else if(s==3){float box=sdRoundBox(q+vec2(0.,b.y*.5),vec2(b.x,b.y*.5),rad*.5),dome=length(vec2(q.x,max(0.,q.y)))-b.x;d=min(box,dome);}else d=sdRoundBox(q,b,rad);float m=1.-smoothstep(-u_apSoft,u_apSoft,d);int bars=int(u_apBars+.5);if(bars>0&&u_apBarW>.001){float w=u_apBarW*.5,fade=u_apSoft*.7+.004,sx=2.*b.x/float(bars+1),sy=2.*b.y/float(bars+1);for(int i=1;i<=4;i++){if(i>bars)break;m*=smoothstep(w,w+fade,abs(q.x-(-b.x+sx*float(i))));m*=smoothstep(w,w+fade,abs(q.y-(-b.y+sy*float(i))));}}return clamp(m+(1.-m)*u_apSpill*.4,0.,1.);}\n\n// ── layered water: separate optical scales instead of summing them first ──\n// waterLayering = 0 preserves the previous compact/muted caustic path.\n\nvec2 legacyDeflectAt(vec2 p,float ior){\n  float coh=u_causticCoherence;\n  float sm=mix(1.,u_causticScale,coh);\n  float detail=mix(1.,u_causticDetail,coh);\n  vec3 f=fieldAtCore(p,101.,sm,1.,detail);\n  float ampComp=mix(1.,1./max(sm,.3),coh);\n  float k=(u_throwZ*.6)*(1.-1./ior)*3.*ampComp/max(.4,u_fieldScale*u_fieldScale);\n  return f.yz*k;\n}\n\n// Broad movement does not generate a sharp caustic network.\n// It slowly warps the locations of the primary/secondary networks and receiver.\nvec2 macroWaterWarp(vec2 p){\n  float coh=u_causticCoherence;\n  float sm=mix(1.,u_causticScale,coh);\n  float fs=max(.7,u_fieldScale*sm);\n  float t=u_time;\n\n  vec2 d1=vec2(cos(u_direction-.47),sin(u_direction-.47));\n  vec2 d2=vec2(cos(u_direction+1.36),sin(u_direction+1.36));\n  vec2 d3=vec2(cos(u_direction+2.71),sin(u_direction+2.71));\n\n  float a=sin(dot(p,d1)*fs*.18-t*.105+.3);\n  float b=sin(dot(p,d2)*fs*.235+t*.073+2.1);\n  float c=sin(dot(p,d3)*fs*.145-t*.061+4.4);\n\n  return (d1*a+d2*b*.8+d3*c*.58)*(.18*u_waterLayering);\n}\n\nvec2 primaryWaterDeflect(vec2 p,float ior){\n  float coh=u_causticCoherence;\n  float sm=mix(1.,u_causticScale,coh);\n  float fs=max(.75,u_fieldScale*sm);\n  float refr=(1.-1./ior)*u_throwZ;\n  float t=u_time;\n\n  vec2 mw=macroWaterWarp(p);\n  vec2 q=p+mw;\n\n  // Slow phase warp breaks the fingerprint-like global regularity\n  // without becoming another fine caustic layer.\n  float nw=(vnoise(vec3(q*fs*.19,t*.055+17.2)).x*2.-1.)*.72;\n\n  vec2 d=vec2(0.);\n\n  {\n    float a=u_direction+.11;\n    vec2 v=vec2(cos(a),sin(a));\n    float w=fs*.48;\n    float ph=dot(q,v)*w-t*.31+nw+.35;\n    d+=v*cos(ph)*(refr*.58/max(w,.42));\n  }\n  {\n    float a=u_direction+2.09;\n    vec2 v=vec2(cos(a),sin(a));\n    float w=fs*.63;\n    float ph=dot(q,v)*w-t*.235-nw*.63+2.37;\n    d+=v*cos(ph)*(refr*.50/max(w,.46));\n  }\n  {\n    float a=u_direction-1.51;\n    vec2 v=vec2(cos(a),sin(a));\n    float w=fs*.79;\n    float ph=dot(q,v)*w-t*.405+nw*.41+4.23;\n    d+=v*cos(ph)*(refr*.36/max(w,.5));\n  }\n\n  // A very small coherent remnant of the existing field keeps organic\n  // asymmetry, but it no longer carries the secondary/micro hierarchy.\n  vec3 organic=fieldAtCore(q,141.,sm*.72,.55,.08);\n  d+=organic.yz*(refr*.032/max(fs,.75));\n\n  return d;\n}\n\nvec2 secondaryWaterDeflect(vec2 p,float ior){\n  float coh=u_causticCoherence;\n  float sm=mix(1.,u_causticScale,coh);\n  float fs=max(.8,u_fieldScale*sm);\n  float refr=(1.-1./ior)*u_throwZ;\n  float t=u_time;\n\n  // Secondary caustics feel like another moving optical sheet:\n  // more macro parallax, different phase velocity and different directions.\n  vec2 q=p+macroWaterWarp(p)*1.42+vec2(.17,-.11);\n  float nw=(vnoise(vec3(q*fs*.31,t*.105+63.7)).x*2.-1.)*.5;\n\n  float strength=mix(.18,.38,u_causticDetail);\n  vec2 d=vec2(0.);\n\n  {\n    float a=u_direction+.83;\n    vec2 v=vec2(cos(a),sin(a));\n    float w=fs*1.12;\n    float ph=dot(q,v)*w-t*.67+nw+1.14;\n    d+=v*cos(ph)*(refr*strength/max(w,.82));\n  }\n  {\n    float a=u_direction-2.23;\n    vec2 v=vec2(cos(a),sin(a));\n    float w=fs*1.43;\n    float ph=dot(q,v)*w-t*.86-nw*.74+3.62;\n    d+=v*cos(ph)*(refr*strength*.78/max(w,1.));\n  }\n  {\n    float a=u_direction+2.77;\n    vec2 v=vec2(cos(a),sin(a));\n    float w=fs*1.66;\n    float ph=dot(q,v)*w-t*1.03+nw*.52+5.1;\n    d+=v*cos(ph)*(refr*strength*.52/max(w,1.1));\n  }\n\n  return d;\n}\n\nfloat causticFromSamples(vec2 d0,vec2 dx,vec2 dy,float e,float focus,float clampMul){\n  vec2 cx=(dx-d0)/e;\n  vec2 cy=(dy-d0)/e;\n  mat2 J=mat2(1.+cx.x,cx.y,cy.x,1.+cy.y);\n  float fl=(.015+u_sunAngle*9.+u_foldClamp*.55)*clampMul;\n  return focus/max(abs(determinant(J)),fl);\n}\n\nfloat legacyCaustic(vec2 p,float e,float ior,out vec2 d0){\n  d0=legacyDeflectAt(p,ior);\n  vec2 dx=legacyDeflectAt(p+vec2(e,0.),ior);\n  vec2 dy=legacyDeflectAt(p+vec2(0.,e),ior);\n  return causticFromSamples(d0,dx,dy,e,u_focusGain,1.);\n}\n\nfloat primaryCaustic(vec2 p,float e,float ior,out vec2 d0){\n  d0=primaryWaterDeflect(p,ior);\n  vec2 dx=primaryWaterDeflect(p+vec2(e,0.),ior);\n  vec2 dy=primaryWaterDeflect(p+vec2(0.,e),ior);\n  return causticFromSamples(d0,dx,dy,e,u_focusGain*1.03,.88);\n}\n\nfloat secondaryCaustic(vec2 p,float e,float ior,out vec2 d0){\n  d0=secondaryWaterDeflect(p,ior);\n  vec2 dx=secondaryWaterDeflect(p+vec2(e,0.),ior);\n  vec2 dy=secondaryWaterDeflect(p+vec2(0.,e),ior);\n  // Lower focus and a larger finite-source clamp keep this layer visibly weaker.\n  return causticFromSamples(d0,dx,dy,e,u_focusGain*.68,1.32);\n}\n\nfloat microWaterAccent(vec2 p){\n  if(u_waterLayering<.001)return 0.;\n  float fs=max(1.,u_fieldScale*mix(1.,u_causticScale,u_causticCoherence));\n  float n=vnoise(vec3(p*fs*2.65,u_time*1.42+91.3)).x;\n  float spark=smoothstep(.72,.94,n);\n  return spark*u_capillary*u_causticDetail*u_waterLayering*.085;\n}\n\nfloat caustic(vec2 p,float e,float ior,out vec2 d0){\n  float L=u_waterLayering;\n\n  vec2 dl;\n  float legacy=legacyCaustic(p,e,ior,dl);\n  if(L<.001){\n    d0=dl;\n    return legacy;\n  }\n\n  vec2 dp,ds;\n  float primary=primaryCaustic(p,e,ior,dp);\n  float secondary=secondaryCaustic(p,e,ior,ds);\n\n  // Primary establishes the dominant cells. Secondary contributes only focused\n  // excess above its own baseline, so it reads as another optical layer rather\n  // than lifting/filling the whole image.\n  float secondaryBase=u_focusGain*.68;\n  float secondaryExcess=max(0.,secondary-secondaryBase);\n  float secondaryWeight=mix(.18,.34,u_causticDetail);\n\n  float layered=primary+secondaryExcess*secondaryWeight;\n  layered*=1.+microWaterAccent(p);\n\n  // Bed refraction follows the dominant sheet plus slow macro lensing.\n  d0=mix(dl,dp+macroWaterWarp(p)*.13,L);\n\n  return mix(legacy,layered,L);\n}\n\nvec2 foldUV(vec2 uv){int type=int(u_foldType+.5);if(type==0||u_foldBlend<.001)return uv;vec2 c=uv*u_foldZoom-vec2(u_foldOffX,u_foldOffY),res=c;float r=length(c),a=atan(c.y,c.x),seg=6.28318530718/max(2.,u_segments);if(type==1){float b=mod(a+u_foldPhase,seg);b=abs(b-seg*.5);res=vec2(cos(b),sin(b))*r;}else if(type==2){float b=mod(a+u_foldPhase,seg)-seg*.5;res=vec2(cos(b),sin(b))*r;}else if(type==3){float lr=log(max(r,1e-4)),na=a+lr*(u_foldTwist*.9)+u_foldPhase,nr=exp(fract(lr*(.18+u_segments*.06))*1.1)*.55;res=vec2(cos(na),sin(na))*nr;}else{float r2=max(dot(c,c),.06);res=rot(u_foldPhase*.5)*(c/r2)*(.3+.7*u_foldTwist);}return mix(uv,res,u_foldBlend);}\nvec2 receiver(vec2 uv){if(u_tilt<.001)return uv;float hy=1.24,d=max(.07,hy-uv.y*u_tilt);vec2 w=vec2(uv.x/d,(1./d)*.9-.72);return mix(uv,w,u_tilt);}\nvec3 substrate(vec2 p){float s=u_subScale,a=vnoise(vec3(p*s*2.4,11.)).x,b=vnoise(vec3(p*s*11.,3.)).x,c=vnoise(vec3(p*s*28.,7.)).x;vec3 plaster=mix(vec3(.92,.90,.87),vec3(.68,.65,.62),clamp(a*.42+b*.24+c*.10,0.,1.));float rg=1.-abs(2.*vnoise(vec3(p*s*7.,21.)).x-1.),peb=smoothstep(.72,.98,rg);vec3 sand=mix(vec3(.80,.72,.58),vec3(.55,.49,.41),b*.7+c*.4);sand=mix(sand,vec3(.44,.42,.40),peb*.55);return mix(plaster,sand,u_substrate)*u_albedo;}\nvoid main(){vec2 uv=v_uv*2.-1.;uv.x*=u_res.x/u_res.y;vec2 fp=foldUV(uv),p=receiver(fp),px=vec2(2./u_res.y);float e=max(length(receiver(foldUV(uv+vec2(px.x,0.)))-p),1e-4);float wOcc=mix(.5-.5*u_medium,1.,u_hybrid),wRef=mix(.5+.5*u_medium,1.,u_hybrid);float rotJ=fract(dot(gl_FragCoord.xy,vec2(.7548776662,.5698402909)))*6.28318530718;float T=1.;if(wOcc>.004){float canopyT=transmission(p,rotJ)*leaves(p);float gapT=solarGaps(p);T=mix(1.,max(canopyT,gapT),wOcc);}vec3 gain=vec3(1.);vec2 d0=vec2(0.);if(wRef>.004){if(u_dispersion>.01){float s=u_dispersion*.05;vec2 dr,dg,db;float cr=caustic(p,e,u_ior*(1.-s),dr),cg=caustic(p,e,u_ior,dg),cb=caustic(p,e,u_ior*(1.+s),db);gain=mix(vec3(1.),vec3(cr,cg,cb),wRef);d0=dg;}else{float c=caustic(p,e,u_ior,d0);gain=mix(vec3(1.),vec3(c),wRef);}}float waterMix=clamp(wRef,0.,1.);float brilliance=mix(1.,u_waterBrilliance,waterMix);gain=mix(vec3(1.),gain,brilliance);float waterSun=mix(1.,mix(.58,1.,u_waterBrilliance),waterMix);vec3 sunCol=mix(vec3(1.,.965,.92),vec3(1.,.86,.68),u_warmth),skyCol=mix(vec3(.42,.55,.85),vec3(.74,.68,.62),u_warmth);vec3 irradiance=sunCol*(T*aperture(p))*gain*waterSun+skyCol*(u_skyFill*.9);vec2 bedP=p+d0*.55*wRef;\nfloat broadBed=1.;\nif(u_waterLayering>.001&&wRef>.004){\n  vec2 mw=macroWaterWarp(p);\n  bedP+=mw*.22*wRef;\n  float n0=vnoise(vec3((p+mw*.35)*.52,u_time*.045+33.7)).x;\n  float n1=.5+.5*sin(dot(p,vec2(.74,.31))*1.05-u_time*.075);\n  float lens=mix(n0,n1,.28);\n  broadBed=mix(1.,mix(.88,1.09,lens),u_waterLayering*wRef);\n}\nvec3 bed=substrate(bedP)*broadBed,col=bed*irradiance;if(u_fresnel>.001&&wRef>.004){vec3 f=fieldAt(p,101.,1.,1.);float slope=clamp(length(f.yz)*.35,0.,1.),fres=pow(1.-clamp(1.-u_tilt*.8,.05,1.),3.)+slope*.35;col+=skyCol*fres*u_fresnel*wRef*u_waterBrilliance*(.4+.6*slope);}outColor=vec4(max(col,0.),1.);} ";

export const TRANSPORT_BRIGHT_FRAGMENT_SHADER = "#version 300 es\nprecision highp float;in vec2 v_uv;out vec4 outColor;uniform vec2 u_res;uniform float u_time;uniform sampler2D u_src;uniform float u_thr;void main(){vec3 c=texture(u_src,v_uv).rgb;float l=dot(c,vec3(.2126,.7152,.0722));outColor=vec4(c*smoothstep(u_thr,u_thr*2.,l),1.);}";

export const TRANSPORT_BLUR_FRAGMENT_SHADER = "#version 300 es\nprecision highp float;in vec2 v_uv;out vec4 outColor;uniform vec2 u_res;uniform float u_time;uniform sampler2D u_src;uniform vec2 u_dir;void main(){vec2 t=u_dir/u_res;vec3 s=texture(u_src,v_uv).rgb*.1964;s+=(texture(u_src,v_uv+t*1.4117).rgb+texture(u_src,v_uv-t*1.4117).rgb)*.2969;s+=(texture(u_src,v_uv+t*3.2941).rgb+texture(u_src,v_uv-t*3.2941).rgb)*.0944;s+=(texture(u_src,v_uv+t*5.1764).rgb+texture(u_src,v_uv-t*5.1764).rgb)*.0103;outColor=vec4(s,1.);}";

export const TRANSPORT_COMPOSITE_FRAGMENT_SHADER = "#version 300 es\nprecision highp float;in vec2 v_uv;out vec4 outColor;uniform vec2 u_res;uniform float u_time;uniform sampler2D u_scene;uniform sampler2D u_bloom;uniform float u_bloom_amt,u_grain,u_vignette,u_contrast,u_saturation,u_chroma,u_seed,u_exposure;\nfloat hash13(vec3 p3){p3=fract(p3*.1031);p3+=dot(p3,p3.zyx+31.32);return fract((p3.x+p3.y)*p3.z);}float hash12(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}vec4 vnoise(vec3 x){vec3 i=floor(x),f=fract(x);vec3 u=f*f*f*(f*(f*6.-15.)+10.);vec3 du=30.*f*f*(f*(f-2.)+1.);float va=hash13(i+vec3(0,0,0)),vb=hash13(i+vec3(1,0,0)),vc=hash13(i+vec3(0,1,0)),vd=hash13(i+vec3(1,1,0)),ve=hash13(i+vec3(0,0,1)),vf=hash13(i+vec3(1,0,1)),vg=hash13(i+vec3(0,1,1)),vh=hash13(i+vec3(1,1,1));float k0=va,k1=vb-va,k2=vc-va,k3=ve-va,k4=va-vb-vc+vd,k5=va-vc-ve+vg,k6=va-vb-ve+vf,k7=-va+vb+vc-vd+ve-vf-vg+vh;float v=k0+k1*u.x+k2*u.y+k3*u.z+k4*u.x*u.y+k5*u.y*u.z+k6*u.z*u.x+k7*u.x*u.y*u.z;vec3 g=du*vec3(k1+k4*u.y+k6*u.z+k7*u.y*u.z,k2+k5*u.z+k4*u.x+k7*u.z*u.x,k3+k6*u.x+k5*u.y+k7*u.x*u.y);return vec4(v,g);}mat2 rot(float a){float s=sin(a),c=cos(a);return mat2(c,-s,s,c);} vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}void main(){vec2 uv=v_uv,c=uv-.5;float r2=dot(c,c);vec2 ca=c*r2*u_chroma*.06;vec3 s=vec3(texture(u_scene,uv+ca).r,texture(u_scene,uv).g,texture(u_scene,uv-ca).b);s+=texture(u_bloom,uv).rgb*u_bloom_amt;s*=u_exposure;vec3 col=aces(s);float l=dot(col,vec3(.2126,.7152,.0722));col=mix(vec3(l),col,u_saturation);col=mix(col,clamp((col-.5)*1.5+.5,0.,1.),u_contrast*.6);col*=1.-smoothstep(.24,.92,r2*1.7)*u_vignette;float g=hash12(gl_FragCoord.xy+u_seed)-.5;col+=g*u_grain*.085;outColor=vec4(clamp(col,0.,1.),1.);}";

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Failed to allocate Transport shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? 'unknown shader compile error';
    gl.deleteShader(shader);
    throw new Error(log);
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext, fragmentSource: string): CompiledProgram {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, TRANSPORT_VERTEX_SHADER);
  let fragmentShader: WebGLShader | null = null;
  let program: WebGLProgram | null = null;
  try {
    fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
    program = gl.createProgram();
    if (!program) throw new Error('Failed to allocate Transport program');
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.bindAttribLocation(program, 0, 'a_pos');
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program) ?? 'unknown program link error';
      throw new Error(log);
    }
    const uniforms = new Map<string, WebGLUniformLocation | null>();
    const uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
    for (let index = 0; index < uniformCount; index += 1) {
      const info = gl.getActiveUniform(program, index);
      if (!info) continue;
      const name = info.name.replace(/\[0\]$/, '');
      uniforms.set(name, gl.getUniformLocation(program, name));
    }
    return { program, uniforms };
  } catch (error) {
    if (program) gl.deleteProgram(program);
    throw error;
  } finally {
    gl.deleteShader(vertexShader);
    if (fragmentShader) gl.deleteShader(fragmentShader);
  }
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

const TRANSPORT_CONTROL_INDEX = new Map<TransportControlKey, number>(
  TRANSPORT_CONTROL_DEFINITIONS.map((definition, index) => [definition.key, index]),
);

export function resolveTransportPerformancePolicy(
  quality: Pick<VisualizerQualitySettings, 'effectiveMode'>,
  requestedTier: TransportPerformanceTier = 'full',
): TransportPerformancePolicy {
  if (quality.effectiveMode === 'mobileSafe') return TRANSPORT_PERFORMANCE_POLICY_MINIMUM;
  return TRANSPORT_PERFORMANCE_POLICIES[requestedTier] ?? TRANSPORT_PERFORMANCE_POLICY_FULL;
}

/**
 * Resolves the values that reach the baseline shader. Mobile-safe reductions
 * are deliberately here, at the renderer boundary, so they cap shader loops
 * without changing the canonical preset values. Motion and react remain host
 * controls: motion advances renderer time, spin drives the CPU fold-phase
 * accumulator, and react is consumed by the host's signal/impulse policy;
 * none of those three have a baseline shader uniform.
 */
function resolveTransportPolicyValue(
  key: TransportControlKey,
  value: number,
  policy: TransportPerformancePolicy,
): number {
  let resolved = finite(value, TRANSPORT_DEFAULT_CONTROLS[key]);
  if (key === 'octaves') resolved = Math.min(resolved, policy.maxOctaves);
  else if (key === 'sunTaps') resolved = Math.min(resolved, policy.maxSunTaps);
  else if (key === 'layers') resolved = Math.min(resolved, policy.maxLayers);
  else if (key === 'leafTiers') resolved = Math.min(resolved, policy.maxLeafTiers);
  else if (key === 'apBars') resolved = Math.min(resolved, policy.maxApBars);
  else if (key === 'leafCount') resolved = Math.min(resolved, policy.maxLeafCount);
  else if (key === 'causticDetail') resolved *= policy.causticDetailScale;
  else if (key === 'waterLayering') resolved = Math.min(resolved, policy.maxWaterLayering);
  else if (key === 'dispersion') resolved = Math.min(resolved, policy.maxDispersion);
  else if (key === 'bloom') resolved = Math.min(resolved, policy.maxBloom);
  return resolved;
}

export function resolveTransportQualityValue(
  key: TransportControlKey,
  value: number,
  quality: Pick<VisualizerQualitySettings, 'effectiveMode' | 'shaderDetail'>,
  performanceTier: TransportPerformanceTier = 'full',
): number {
  return resolveTransportPolicyValue(
    key,
    value,
    resolveTransportPerformancePolicy(quality, performanceTier),
  );
}

export function transportUniformValueChanged(previous: number, value: number, initialized: boolean): boolean {
  return !initialized || previous !== Math.fround(value);
}

export function resolveTransportImpulseShaderTime(
  impulseTimeMs: number,
  frameTimeMs: number,
  visualTime: number,
): number {
  const frameMs = finite(frameTimeMs, 0);
  const impulseMs = finite(impulseTimeMs, frameMs);
  const age = Math.max(0, Math.min(9, (frameMs - impulseMs) * 0.001));
  return finite(visualTime, 0) - age;
}

export interface TransportRenderSize {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly sceneWidth: number;
  readonly sceneHeight: number;
  readonly bloomWidth: number;
  readonly bloomHeight: number;
}

export function resolveTransportRenderSize(
  cssWidth: number,
  cssHeight: number,
  dpr: number,
  scale: number,
): TransportRenderSize {
  const safeWidth = Math.max(1, Math.floor(finite(cssWidth, 1)));
  const safeHeight = Math.max(1, Math.floor(finite(cssHeight, 1)));
  const safeDpr = Math.max(0.25, finite(dpr, 1));
  const safeScale = Math.max(0.05, finite(scale, 0.85));
  const canvasWidth = Math.max(1, Math.floor(safeWidth * safeDpr));
  const canvasHeight = Math.max(1, Math.floor(safeHeight * safeDpr));
  const sceneWidth = Math.max(2, Math.round(canvasWidth * safeScale));
  const sceneHeight = Math.max(2, Math.round(canvasHeight * safeScale));
  return {
    canvasWidth,
    canvasHeight,
    sceneWidth,
    sceneHeight,
    bloomWidth: Math.max(2, sceneWidth >> 1),
    bloomHeight: Math.max(2, sceneHeight >> 1),
  };
}

function get2dContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  try {
    return canvas.getContext('2d');
  } catch {
    return null;
  }
}

export class TransportVisualizerRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext | null;
  private readonly context2d: CanvasRenderingContext2D | null;
  private sceneProgram: CompiledProgram | null = null;
  private brightProgram: CompiledProgram | null = null;
  private blurProgram: CompiledProgram | null = null;
  private compositeProgram: CompiledProgram | null = null;
  private vertexBuffer: WebGLBuffer | null = null;
  private vertexArray: WebGLVertexArrayObject | null = null;
  private sceneTarget: RenderTarget | null = null;
  private bloomA: RenderTarget | null = null;
  private bloomB: RenderTarget | null = null;
  private readonly sceneControlUniforms = new Array<WebGLUniformLocation | null>(TRANSPORT_CONTROL_DEFINITIONS.length).fill(null);
  private readonly brightControlUniforms = new Array<WebGLUniformLocation | null>(TRANSPORT_CONTROL_DEFINITIONS.length).fill(null);
  private readonly compositeControlUniforms = new Array<WebGLUniformLocation | null>(TRANSPORT_CONTROL_DEFINITIONS.length).fill(null);
  private readonly sceneControlValues = new Float32Array(TRANSPORT_CONTROL_DEFINITIONS.length);
  private readonly brightControlValues = new Float32Array(TRANSPORT_CONTROL_DEFINITIONS.length);
  private readonly compositeControlValues = new Float32Array(TRANSPORT_CONTROL_DEFINITIONS.length);
  private readonly sceneControlInitialized = new Uint8Array(TRANSPORT_CONTROL_DEFINITIONS.length);
  private readonly brightControlInitialized = new Uint8Array(TRANSPORT_CONTROL_DEFINITIONS.length);
  private readonly compositeControlInitialized = new Uint8Array(TRANSPORT_CONTROL_DEFINITIONS.length);
  private readonly impulseData = new Float32Array(TRANSPORT_MAX_IMPULSES * 4);
  private readonly impulseMotionData = new Float32Array(TRANSPORT_MAX_IMPULSES * 4);
  private cssWidth = 1;
  private cssHeight = 1;
  private pixelWidth = 1;
  private pixelHeight = 1;
  private targetScale = TRANSPORT_PERFORMANCE_POLICY_FULL.sceneScale;
  private performancePolicy: TransportPerformancePolicy = TRANSPORT_PERFORMANCE_POLICY_FULL;
  private visualTime = 0;
  private wallTime = 0;
  private foldPhase = 0;
  private foldVelocity = 0;
  private lastFrameTimeMs: number | null = null;
  private contextLost = false;
  private destroyed = false;

  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault();
    this.contextLost = true;
    this.resetTemporalState();
    this.destroyGl();
  };

  private readonly handleContextRestored = (): void => {
    if (this.destroyed || !this.gl) return;
    this.contextLost = false;
    this.resetTemporalState();
    try {
      this.initGl();
      this.ensureTargets(this.pixelWidth, this.pixelHeight, this.targetScale);
    } catch (error) {
      console.warn('Transport visualizer WebGL restore failed.', error);
      this.destroyGl();
    }
  };

  constructor(canvas: HTMLCanvasElement, options: { forceCanvas2d?: boolean } = {}) {
    this.canvas = canvas;
    let gl: WebGL2RenderingContext | null = null;
    if (!options.forceCanvas2d) {
      try {
        gl = canvas.getContext('webgl2', {
          alpha: false,
          antialias: false,
          depth: false,
          stencil: false,
          powerPreference: 'high-performance',
          preserveDrawingBuffer: false,
        });
      } catch {
        gl = null;
      }
    }
    this.gl = gl;
    this.context2d = gl ? null : get2dContext(canvas);
    if (gl) {
      canvas.addEventListener('webglcontextlost', this.handleContextLost, false);
      canvas.addEventListener('webglcontextrestored', this.handleContextRestored, false);
      try {
        this.initGl();
      } catch (error) {
        console.warn('Transport visualizer WebGL2 init failed; using fallback.', error);
        this.destroyGl();
      }
    }
  }

  get mode(): RendererMode {
    return this.gl && this.sceneProgram && !this.contextLost ? 'webgl2' : 'canvas2d';
  }

  resize(width: number, height: number, dpr: number): void {
    const safeWidth = Math.max(1, Math.floor(finite(width, 1)));
    const safeHeight = Math.max(1, Math.floor(finite(height, 1)));
    const size = resolveTransportRenderSize(safeWidth, safeHeight, dpr, 1);
    this.pixelWidth = size.canvasWidth;
    this.pixelHeight = size.canvasHeight;
    if (this.canvas.width !== this.pixelWidth) this.canvas.width = this.pixelWidth;
    if (this.canvas.height !== this.pixelHeight) this.canvas.height = this.pixelHeight;
    if (this.cssWidth !== safeWidth) {
      this.canvas.style.width = `${safeWidth}px`;
      this.cssWidth = safeWidth;
    }
    if (this.cssHeight !== safeHeight) {
      this.canvas.style.height = `${safeHeight}px`;
      this.cssHeight = safeHeight;
    }
    if (this.gl && this.sceneProgram && !this.contextLost) {
      try {
        this.ensureTargets(this.pixelWidth, this.pixelHeight, this.targetScale);
      } catch (error) {
        console.warn('Transport visualizer resize failed.', error);
        this.destroyGl();
      }
    }
  }

  render(frame: TransportVisualizerFrame): void {
    if (this.destroyed) return;
    this.performancePolicy = resolveTransportPerformancePolicy(frame.quality, frame.performanceTier);
    this.targetScale = this.performancePolicy.sceneScale;
    if (this.gl && this.sceneProgram && !this.contextLost) {
      try {
        if (!this.ensureTargets(this.pixelWidth, this.pixelHeight, this.targetScale)) return;
        this.renderGl(frame);
      } catch (error) {
        console.warn('Transport visualizer render failed.', error);
      }
      return;
    }
    this.renderCanvas2d(frame);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.gl) {
      this.canvas.removeEventListener('webglcontextlost', this.handleContextLost, false);
      this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored, false);
    }
    this.destroyGl();
  }

  private initGl(): void {
    const gl = this.gl;
    if (!gl) return;
    this.sceneProgram = createProgram(gl, TRANSPORT_SCENE_FRAGMENT_SHADER);
    this.brightProgram = createProgram(gl, TRANSPORT_BRIGHT_FRAGMENT_SHADER);
    this.blurProgram = createProgram(gl, TRANSPORT_BLUR_FRAGMENT_SHADER);
    this.compositeProgram = createProgram(gl, TRANSPORT_COMPOSITE_FRAGMENT_SHADER);
    this.vertexBuffer = gl.createBuffer();
    this.vertexArray = gl.createVertexArray();
    if (!this.vertexBuffer || !this.vertexArray) throw new Error('Failed to allocate Transport geometry');
    gl.bindVertexArray(this.vertexArray);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.sceneControlInitialized.fill(0);
    this.brightControlInitialized.fill(0);
    this.compositeControlInitialized.fill(0);
    for (let index = 0; index < TRANSPORT_CONTROL_DEFINITIONS.length; index += 1) {
      const definition = TRANSPORT_CONTROL_DEFINITIONS[index];
      if (!definition) continue;
      const key = definition.key;
      this.sceneControlUniforms[index] = this.sceneProgram.uniforms.get(`u_${key}`) ?? null;
      this.brightControlUniforms[index] = key === 'bloomThr'
        ? this.brightProgram.uniforms.get('u_thr') ?? null
        : null;
      this.compositeControlUniforms[index] = key === 'bloom'
        ? this.compositeProgram.uniforms.get('u_bloom_amt') ?? null
        : this.compositeProgram.uniforms.get(`u_${key}`) ?? null;
    }
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
  }

  private destroyGl(): void {
    const gl = this.gl;
    if (!gl) return;
    this.destroyTarget(this.sceneTarget);
    this.destroyTarget(this.bloomA);
    this.destroyTarget(this.bloomB);
    this.sceneTarget = null;
    this.bloomA = null;
    this.bloomB = null;
    if (this.vertexArray) gl.deleteVertexArray(this.vertexArray);
    if (this.vertexBuffer) gl.deleteBuffer(this.vertexBuffer);
    if (this.sceneProgram) gl.deleteProgram(this.sceneProgram.program);
    if (this.brightProgram) gl.deleteProgram(this.brightProgram.program);
    if (this.blurProgram) gl.deleteProgram(this.blurProgram.program);
    if (this.compositeProgram) gl.deleteProgram(this.compositeProgram.program);
    this.vertexArray = null;
    this.vertexBuffer = null;
    this.sceneProgram = null;
    this.brightProgram = null;
    this.blurProgram = null;
    this.compositeProgram = null;
    this.sceneControlInitialized.fill(0);
    this.brightControlInitialized.fill(0);
    this.compositeControlInitialized.fill(0);
    this.sceneControlUniforms.fill(null);
    this.brightControlUniforms.fill(null);
    this.compositeControlUniforms.fill(null);
  }

  private destroyTarget(target: RenderTarget | null): void {
    if (!target || !this.gl) return;
    this.gl.deleteFramebuffer(target.framebuffer);
    this.gl.deleteTexture(target.texture);
  }

  private ensureTargets(pixelWidth: number, pixelHeight: number, scale: number): boolean {
    const gl = this.gl;
    if (!gl || !this.sceneProgram) return false;
    const sceneWidth = Math.max(2, Math.round(pixelWidth * scale));
    const sceneHeight = Math.max(2, Math.round(pixelHeight * scale));
    const bloomWidth = Math.max(2, sceneWidth >> 1);
    const bloomHeight = Math.max(2, sceneHeight >> 1);
    if (this.sceneTarget?.width === sceneWidth
      && this.sceneTarget.height === sceneHeight
      && this.bloomA?.width === bloomWidth
      && this.bloomA.height === bloomHeight
      && this.bloomB?.width === bloomWidth
      && this.bloomB.height === bloomHeight) return true;
    let sceneTarget: RenderTarget | null = null;
    let bloomA: RenderTarget | null = null;
    let bloomB: RenderTarget | null = null;
    try {
      sceneTarget = this.createTarget(sceneWidth, sceneHeight);
      bloomA = this.createTarget(bloomWidth, bloomHeight);
      bloomB = this.createTarget(bloomWidth, bloomHeight);
    } catch (error) {
      this.destroyTarget(sceneTarget);
      this.destroyTarget(bloomA);
      this.destroyTarget(bloomB);
      throw error;
    }
    this.destroyTarget(this.sceneTarget);
    this.destroyTarget(this.bloomA);
    this.destroyTarget(this.bloomB);
    this.sceneTarget = sceneTarget;
    this.bloomA = bloomA;
    this.bloomB = bloomB;
    return true;
  }

  private createTarget(width: number, height: number): RenderTarget {
    const gl = this.gl;
    if (!gl) throw new Error('Transport WebGL context unavailable');
    const floatTargets = Boolean(gl.getExtension('EXT_color_buffer_float'));
    const linearFloat = Boolean(gl.getExtension('OES_texture_float_linear'));
    const texture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    if (!texture || !framebuffer) {
      if (texture) gl.deleteTexture(texture);
      if (framebuffer) gl.deleteFramebuffer(framebuffer);
      throw new Error('Failed to allocate Transport render target');
    }
    try {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        floatTargets ? gl.RGBA16F : gl.RGBA8,
        width,
        height,
        0,
        gl.RGBA,
        floatTargets ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE,
        null,
      );
      const filter = floatTargets && !linearFloat ? gl.NEAREST : gl.LINEAR;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error('Transport framebuffer is incomplete');
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      return { texture, framebuffer, width, height };
    } catch (error) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.deleteFramebuffer(framebuffer);
      gl.deleteTexture(texture);
      throw error;
    }
  }

  private renderGl(frame: TransportVisualizerFrame): void {
    const gl = this.gl;
    const sceneProgram = this.sceneProgram;
    const brightProgram = this.brightProgram;
    const blurProgram = this.blurProgram;
    const compositeProgram = this.compositeProgram;
    const sceneTarget = this.sceneTarget;
    const bloomA = this.bloomA;
    const bloomB = this.bloomB;
    if (!gl || !sceneProgram || !brightProgram || !blurProgram || !compositeProgram || !sceneTarget || !bloomA || !bloomB || !this.vertexArray) return;

    this.advanceTemporalState(frame);
    this.packImpulses(frame);
    gl.bindVertexArray(this.vertexArray);

    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneTarget.framebuffer);
    gl.viewport(0, 0, sceneTarget.width, sceneTarget.height);
    gl.useProgram(sceneProgram.program);
    this.setUniform2f(sceneProgram, 'u_res', sceneTarget.width, sceneTarget.height);
    this.setUniform1f(sceneProgram, 'u_time', this.visualTime);
    this.setUniform1f(sceneProgram, 'u_foldPhase', this.foldPhase);
    this.setControlUniforms(frame.controls, this.performancePolicy);
    this.setUniform4fv(sceneProgram, 'u_imp', this.impulseData);
    this.setUniform4fv(sceneProgram, 'u_impM', this.impulseMotionData);
    this.setUniform1i(sceneProgram, 'u_impCount', this.impulseCount(frame));
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const bloomAmount = this.controlValue(frame.controls, 'bloom', this.performancePolicy);
    if (bloomAmount > 0.005) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, bloomA.framebuffer);
      gl.viewport(0, 0, bloomA.width, bloomA.height);
      gl.useProgram(brightProgram.program);
      this.setUniform2f(brightProgram, 'u_res', bloomA.width, bloomA.height);
      this.setCachedControlUniform('bloomThr', this.controlValue(frame.controls, 'bloomThr', this.performancePolicy), this.brightControlUniforms, this.brightControlValues, this.brightControlInitialized);
      this.bindTexture(0, sceneTarget.texture);
      this.setUniform1i(brightProgram, 'u_src', 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      this.drawBlur(blurProgram, bloomA, bloomB, 1, 0);
      this.drawBlur(blurProgram, bloomB, bloomA, 0, 1);
    } else {
      this.clearTarget(bloomA);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(compositeProgram.program);
    this.setUniform2f(compositeProgram, 'u_res', this.canvas.width, this.canvas.height);
    this.bindTexture(0, sceneTarget.texture);
    this.bindTexture(1, bloomA.texture);
    this.setUniform1i(compositeProgram, 'u_scene', 0);
    this.setUniform1i(compositeProgram, 'u_bloom', 1);
    this.setCachedControlUniform('bloom', bloomAmount, this.compositeControlUniforms, this.compositeControlValues, this.compositeControlInitialized);
    this.setCachedControlUniform('chroma', this.controlValue(frame.controls, 'chroma', this.performancePolicy), this.compositeControlUniforms, this.compositeControlValues, this.compositeControlInitialized);
    this.setCachedControlUniform('grain', this.controlValue(frame.controls, 'grain', this.performancePolicy), this.compositeControlUniforms, this.compositeControlValues, this.compositeControlInitialized);
    this.setCachedControlUniform('vignette', this.controlValue(frame.controls, 'vignette', this.performancePolicy), this.compositeControlUniforms, this.compositeControlValues, this.compositeControlInitialized);
    this.setCachedControlUniform('contrast', this.controlValue(frame.controls, 'contrast', this.performancePolicy), this.compositeControlUniforms, this.compositeControlValues, this.compositeControlInitialized);
    this.setCachedControlUniform('saturation', this.controlValue(frame.controls, 'saturation', this.performancePolicy), this.compositeControlUniforms, this.compositeControlValues, this.compositeControlInitialized);
    this.setCachedControlUniform('exposure', this.controlValue(frame.controls, 'exposure', this.performancePolicy), this.compositeControlUniforms, this.compositeControlValues, this.compositeControlInitialized);
    this.setUniform1f(compositeProgram, 'u_seed', (this.wallTime * 61.7) % 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  private drawBlur(program: CompiledProgram, source: RenderTarget, target: RenderTarget, directionX: number, directionY: number): void {
    const gl = this.gl;
    if (!gl || !this.vertexArray) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.viewport(0, 0, target.width, target.height);
    gl.useProgram(program.program);
    this.setUniform2f(program, 'u_res', source.width, source.height);
    this.setUniform2f(program, 'u_dir', directionX, directionY);
    this.bindTexture(0, source.texture);
    this.setUniform1i(program, 'u_src', 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private clearTarget(target: RenderTarget): void {
    const gl = this.gl;
    if (!gl) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.viewport(0, 0, target.width, target.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  private setControlUniforms(controls: ReadonlyTransportControls, policy: TransportPerformancePolicy): void {
    const gl = this.gl;
    if (!gl) return;
    for (let index = 0; index < TRANSPORT_CONTROL_DEFINITIONS.length; index += 1) {
      const definition = TRANSPORT_CONTROL_DEFINITIONS[index];
      if (!definition) continue;
      this.setCachedControlUniform(
        definition.key,
        resolveTransportPolicyValue(definition.key, controls[definition.key], policy),
        this.sceneControlUniforms,
        this.sceneControlValues,
        this.sceneControlInitialized,
      );
    }
  }

  private setCachedControlUniform(
    key: TransportControlKey,
    value: number,
    locations: readonly (WebGLUniformLocation | null)[],
    values: Float32Array,
    initialized: Uint8Array,
  ): void {
    const gl = this.gl;
    const index = TRANSPORT_CONTROL_INDEX.get(key);
    if (!gl || index === undefined) return;
    const location = locations[index];
    if (!location) return;
    const packedValue = Math.fround(value);
    if (transportUniformValueChanged(values[index] ?? 0, packedValue, initialized[index] !== 0)) {
      gl.uniform1f(location, packedValue);
      values[index] = packedValue;
      initialized[index] = 1;
    }
  }

  private controlValue(controls: ReadonlyTransportControls, key: TransportControlKey, policy: TransportPerformancePolicy): number {
    return resolveTransportPolicyValue(key, controls[key], policy);
  }

  private resetTemporalState(): void {
    this.visualTime = 0;
    this.wallTime = 0;
    this.foldPhase = 0;
    this.foldVelocity = 0;
    this.lastFrameTimeMs = null;
  }

  private advanceTemporalState(frame: TransportVisualizerFrame): void {
    const nowMs = finite(frame.timeMs, 0);
    if (this.lastFrameTimeMs === null) {
      this.lastFrameTimeMs = nowMs;
      return;
    }
    const rawDelta = (nowMs - this.lastFrameTimeMs) * 0.001;
    this.lastFrameTimeMs = nowMs;
    if (!Number.isFinite(rawDelta) || rawDelta < 0 || rawDelta > 1) {
      this.resetTemporalState();
      this.lastFrameTimeMs = nowMs;
      return;
    }
    const delta = Math.min(0.05, rawDelta);
    const motion = finite(frame.controls.motion, TRANSPORT_DEFAULT_CONTROLS.motion);
    const spin = finite(frame.controls.spin, TRANSPORT_DEFAULT_CONTROLS.spin);
    this.visualTime += delta * motion;
    this.wallTime += delta;
    this.foldVelocity += (spin * 1.6 - this.foldVelocity) * (1 - Math.exp(-delta * 2.4));
    this.foldPhase += this.foldVelocity * delta * motion;
  }

  private setUniform1f(program: CompiledProgram, name: string, value: number): void {
    const location = program.uniforms.get(name);
    if (location && this.gl) this.gl.uniform1f(location, value);
  }

  private setUniform1i(program: CompiledProgram, name: string, value: number): void {
    const location = program.uniforms.get(name);
    if (location && this.gl) this.gl.uniform1i(location, value);
  }

  private setUniform2f(program: CompiledProgram, name: string, x: number, y: number): void {
    const location = program.uniforms.get(name);
    if (location && this.gl) this.gl.uniform2f(location, x, y);
  }

  private setUniform4fv(program: CompiledProgram, name: string, value: Float32Array): void {
    const location = program.uniforms.get(name);
    if (location && this.gl) this.gl.uniform4fv(location, value);
  }

  private bindTexture(unit: number, texture: WebGLTexture): void {
    if (!this.gl) return;
    this.gl.activeTexture(this.gl.TEXTURE0 + unit);
    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
  }

  private impulseCount(frame: TransportVisualizerFrame): number {
    return Math.min(TRANSPORT_MAX_IMPULSES, frame.impulses.length);
  }

  private packImpulses(frame: TransportVisualizerFrame): void {
    const impulses = frame.impulses;
    const count = Math.min(TRANSPORT_MAX_IMPULSES, impulses.length);
    const start = Math.max(0, impulses.length - count);
    this.impulseData.fill(0);
    this.impulseMotionData.fill(0);
    for (let index = 0; index < count; index += 1) {
      const impulse = impulses[start + index];
      if (!impulse) continue;
      const offset = index * 4;
      this.impulseData[offset] = finite(impulse.x, 0);
      this.impulseData[offset + 1] = finite(impulse.y, 0);
      this.impulseData[offset + 2] = resolveTransportImpulseShaderTime(impulse.timeMs, frame.timeMs, this.visualTime);
      this.impulseData[offset + 3] = finite(impulse.strength, 0);
      this.impulseMotionData[offset] = finite(impulse.speed, 0.55);
      this.impulseMotionData[offset + 1] = finite(impulse.frequency, 26);
      this.impulseMotionData[offset + 2] = finite(impulse.decay, 1.1);
      this.impulseMotionData[offset + 3] = finite(impulse.tight, 5);
    }
  }

  private renderCanvas2d(frame: TransportVisualizerFrame): void {
    const controls = frame.controls;
    const context = this.context2d;
    if (!context) {
      if (this.gl && !this.contextLost) {
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        this.gl.clearColor(0.047, 0.043, 0.039, 1);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
      }
      return;
    }
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#0c0b0a';
    context.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const centreX = this.canvas.width * .5;
    const centreY = this.canvas.height * .5;
    const radius = Math.min(this.canvas.width, this.canvas.height) * (.16 + finite(controls.leafSize, .55) * .24);
    const motion = finite(controls.motion, .34);
    const strength = .35 + finite(controls.waterBrilliance, 1) * .35 + finite(controls.leafAmount, 0) * .25;
    context.strokeStyle = `rgba(184,224,255,${Math.min(.9, strength)})`;
    context.lineWidth = Math.max(1, this.canvas.width / 480);
    context.beginPath();
    const segments = Math.max(12, Math.min(72, Math.round(18 + finite(controls.segments, 6) * 2)));
    const phase = finite(frame.timeMs, 0) * .001 * motion;
    for (let index = 0; index <= segments; index += 1) {
      const angle = index / segments * Math.PI * 2;
      const wave = Math.sin(angle * 3 + phase) * radius * .12 + Math.sin(angle * 7 - phase * .7) * radius * .05;
      const x = centreX + Math.cos(angle) * (radius + wave);
      const y = centreY + Math.sin(angle) * (radius + wave);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.closePath();
    context.stroke();
  }
}
