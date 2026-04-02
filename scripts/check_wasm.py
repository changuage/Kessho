import os
wasm_path = r'c:\Users\chpa9007\Downloads\generativemusic\wasm\lead-fm\kessho_lead_fm.wasm'
data = open(wasm_path, 'rb').read()
out_path = r'c:\Users\chpa9007\Downloads\generativemusic\wasm_check.txt'
with open(out_path, 'w') as f:
    f.write(f'SIZE:{len(data)}\n')
    f.write(f'HAS_NOTE_ON_EX:{b"lead_fm_note_on_ex" in data}\n')
    f.write(f'HAS_OUTPUT2_PTR:{b"lead_fm_get_output2_ptr" in data}\n')
    f.write(f'MODIFIED:{os.path.getmtime(wasm_path)}\n')
print('Done')
