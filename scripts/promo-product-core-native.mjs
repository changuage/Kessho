import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { kesshoCoreIncludeArgs, resolveKesshoCoreSources } from './kessho-core-build-manifest.mjs';

const root=process.cwd();
const outDir=resolve(root,'promo-capture-v3-artifacts');
const buildDir=resolve(root,'build/kessho-core/promo');
const source=resolve(root,'cpp/KesshoCore/tests/PromoAudioRender.cpp');
const binary=resolve(buildDir,'promo_audio_render');
const wav=resolve(outDir,'product-core-native.wav');
rmSync(buildDir,{recursive:true,force:true}); mkdirSync(buildDir,{recursive:true}); mkdirSync(outDir,{recursive:true});
const sources=resolveKesshoCoreSources(root);
const args=['-std=c++17','-O2','-Wall','-Wextra','-Werror',...kesshoCoreIncludeArgs(root),...sources,source,'-o',binary];
console.log(`> /usr/bin/clang++ ${args.join(' ')}`);
execFileSync('/usr/bin/clang++',args,{cwd:root,stdio:'inherit'});
console.log(`> ${binary} ${wav}`);
execFileSync(binary,[wav],{cwd:root,stdio:'inherit'});
