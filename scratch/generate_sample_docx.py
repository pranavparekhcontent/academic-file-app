import zipfile, os

FONT = 'Calibri'
PAGE_W = 16838
PAGE_H = 11906
MARGIN_SIDE = 720
MARGIN_VERT = 720
TEXT_W = PAGE_W - (2 * MARGIN_SIDE)

def xml_esc(s):
    if s is None: return ''
    return str(s).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')

def run(text, b=False, sz=20, color=None):
    size = max(14, sz)
    rpr = f'<w:rFonts w:ascii="{FONT}" w:hAnsi="{FONT}" w:cs="{FONT}"/>'
    if b: rpr += '<w:b/>'
    if color: rpr += f'<w:color w:val="{color}"/>'
    rpr += f'<w:sz w:val="{size}"/>'
    lines = str(text or '').split('\n')
    tnodes = '<w:br/>'.join([f'<w:t xml:space="preserve">{xml_esc(l)}</w:t>' for l in lines])
    return f'<w:r><w:rPr>{rpr}</w:rPr>{tnodes}</w:r>'

def para(runs, align='left', before=0, after=60, line=240):
    ppr = f'<w:spacing w:before="{before}" w:after="{after}" w:line="{line}" w:lineRule="auto"/>'
    if align: ppr += f'<w:jc w:val="{align}"/>'
    return f'<w:p><w:pPr>{ppr}</w:pPr>{runs}</w:p>'

def cell(runs, shade=None, align='center', v_align='center', grid_span=None, v_merge=None):
    tcpr = f'<w:vAlign w:val="{v_align}"/>'
    if shade: tcpr += f'<w:shd w:val="clear" w:color="auto" w:fill="{shade}"/>'
    if grid_span and grid_span > 1: tcpr += f'<w:gridSpan w:val="{grid_span}"/>'
    if v_merge == 'restart': tcpr += '<w:vMerge w:val="restart"/>'
    elif v_merge == 'continue': tcpr += '<w:vMerge/>'
    ppr = f'<w:spacing w:before="40" w:after="40" w:line="220" w:lineRule="auto"/><w:jc w:val="{align}"/>'
    return f'<w:tc><w:tcPr>{tcpr}</w:tcPr><w:p><w:pPr>{ppr}</w:pPr>{runs}</w:p></w:tc>'

cols = [1100, 2700, 2300, 850, 850, 850, 850, 850, 850, 850, 850, 850, 1300]
grid = '<w:tblGrid>' + ''.join([f'<w:gridCol w:w="{w}"/>' for w in cols]) + '</w:tblGrid>'

thShade = 'E8EFF8'

# Header Row 1
h1 = '<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>'
h1 += cell(run('Year', b=True, sz=18), shade=thShade, align='center', v_merge='restart')
h1 += cell(run('Name of Subject', b=True, sz=18), shade=thShade, align='center', v_merge='restart')
h1 += cell(run('Name of Faculty', b=True, sz=18), shade=thShade, align='center', v_merge='restart')
h1 += cell(run('Total No. conducted', b=True, sz=18), shade=thShade, align='center', grid_span=3)
h1 += cell(run('No. required to complete Syllabus', b=True, sz=18), shade=thShade, align='center', grid_span=3)
h1 += cell(run('Total Syllabus Covered (%)', b=True, sz=18), shade=thShade, align='center', grid_span=3)
h1 += cell(run('Sign of Staff', b=True, sz=18), shade=thShade, align='center', v_merge='restart')
h1 += '</w:tr>'

# Header Row 2 — Removed hardcoded (45) and (15)
h2 = '<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>'
h2 += cell('', shade=thShade, v_merge='continue')
h2 += cell('', shade=thShade, v_merge='continue')
h2 += cell('', shade=thShade, v_merge='continue')
h2 += cell(run('Theory', b=True, sz=17), shade=thShade, align='center')
h2 += cell(run('Tutorials', b=True, sz=17), shade=thShade, align='center')
h2 += cell(run('Practicals', b=True, sz=17), shade=thShade, align='center')
h2 += cell(run('Theory', b=True, sz=17), shade=thShade, align='center')
h2 += cell(run('Tutorials', b=True, sz=17), shade=thShade, align='center')
h2 += cell(run('Practicals', b=True, sz=17), shade=thShade, align='center')
h2 += cell(run('Theory', b=True, sz=17), shade=thShade, align='center')
h2 += cell(run('Tutorials', b=True, sz=17), shade=thShade, align='center')
h2 += cell(run('Practicals', b=True, sz=17), shade=thShade, align='center')
h2 += cell('', shade=thShade, v_merge='continue')
h2 += '</w:tr>'

# Sample Data rows
sample_subjects = [
    ('T. Y.', 'Biopharmaceutics (BP604T)', 'Dr. Pranav Parekh', False, 15, 45, 33),
    ('T. Y.', 'Quality Assurance (QA) (BP606T)', 'Dr. V. M. Chatur', False, 16, 45, 36),
    ('T. Y.', 'Pharmaceutical Biotechnology (BP605T)', 'Ms. Sayli Deth', False, 14, 45, 31),
    ('T. Y.', 'Medicinal Chemistry III (BP601T)', 'Ms. Snehal Tuse', False, 15, 45, 33),
    ('T. Y.', 'Pharmacology III (BP602T)', 'Mr. Shubham Waghmare', False, 13, 45, 29),
    ('T. Y.', 'Herbal Drug Technology (BP603T)', 'Dr. S.P. Ghode', False, 14, 45, 31),
    ('T. Y.', 'Medicinal Chemistry III (BP607P) [Batch A]', 'Ms. Snehal Tuse', True, 6, 15, 40),
    ('T. Y.', 'Pharmacology III (BP608P) [Batch A]', 'Mr. Shubham Waghmare', True, 6, 15, 40),
    ('T. Y.', 'Herbal Drug Technology (BP609P) [Batch A]', 'Dr. S.P. Ghode', True, 6, 15, 40),
]

body_rows = ''
for i, (yr, sub, fac, is_prac, cond, plan, pct) in enumerate(sample_subjects):
    shade = 'F8FAFC' if i % 2 == 1 else None
    req = max(0, plan - cond)
    cond_fmt = f'{cond:02d}/{plan:02d}'
    req_fmt = f'{req:02d}' if req > 0 else '00'
    
    c_th = '-' if is_prac else cond_fmt
    c_tut = ' '
    c_pr = cond_fmt if is_prac else '-'
    
    r_th = '-' if is_prac else req_fmt
    r_tut = ' '
    r_pr = req_fmt if is_prac else '-'
    
    p_th = '-' if is_prac else f'{pct}%'
    p_tut = ' '
    p_pr = f'{pct}%' if is_prac else '-'
    
    r_xml = cell(run(yr if i == 0 else '', sz=18), shade=shade, align='center')
    r_xml += cell(run(sub, sz=18), shade=shade, align='left')
    r_xml += cell(run(fac, sz=18), shade=shade, align='left')
    r_xml += cell(run(c_th, sz=18), shade=shade, align='center')
    r_xml += cell(run(c_tut, sz=18), shade=shade, align='center')
    r_xml += cell(run(c_pr, sz=18), shade=shade, align='center')
    r_xml += cell(run(r_th, sz=18), shade=shade, align='center')
    r_xml += cell(run(r_tut, sz=18), shade=shade, align='center')
    r_xml += cell(run(r_pr, sz=18), shade=shade, align='center')
    r_xml += cell(run(p_th, sz=18), shade=shade, align='center')
    r_xml += cell(run(p_tut, sz=18), shade=shade, align='center')
    r_xml += cell(run(p_pr, sz=18), shade=shade, align='center')
    r_xml += cell(run('', sz=18), shade=shade, align='center')
    body_rows += f'<w:tr><w:trPr><w:cantSplit/></w:trPr>{r_xml}</w:tr>'

tbl_borders = '<w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="94A3B8"/><w:left w:val="single" w:sz="4" w:space="0" w:color="94A3B8"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="94A3B8"/><w:right w:val="single" w:sz="4" w:space="0" w:color="94A3B8"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/></w:tblBorders>'
tbl_pr = f'<w:tblPr><w:tblW w:w="{sum(cols)}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:jc w:val="center"/>{tbl_borders}</w:tblPr>'
table_xml = f'<w:tbl>{tbl_pr}{grid}{h1}{h2}{body_rows}</w:tbl>'

# Signatures Table
half = TEXT_W // 2
sign_cols = [half, half]
sign_grid = '<w:tblGrid>' + ''.join([f'<w:gridCol w:w="{w}"/>' for w in sign_cols]) + '</w:tblGrid>'
sign_row = '<w:tr><w:trPr><w:cantSplit/></w:trPr>'
sign_row += f'<w:tc><w:tcPr><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:jc w:val="left"/><w:spacing w:line="240" w:lineRule="auto"/></w:pPr>{run("Dr. S.P. Ghode\\nAcademic Incharge", b=True, sz=22)}</w:p></w:tc>'
sign_row += f'<w:tc><w:tcPr><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:jc w:val="right"/><w:spacing w:line="240" w:lineRule="auto"/></w:pPr>{run("Dr. S. G. Walode\\nPrincipal", b=True, sz=22)}</w:p></w:tc>'
sign_row += '</w:tr>'
sign_tbl = f'<w:tbl><w:tblPr><w:tblW w:w="{TEXT_W}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:jc w:val="center"/></w:tblPr>{sign_grid}{sign_row}</w:tbl>'

doc_xml = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
{para(run("Shri Jain Vidya Prasarak Mandal's", b=True, sz=22, color='333333'), align='center', after=30)}
{para(run("Rasiklal M. Dhariwal Institute of Pharmaceutical Education and Research, Chinchwad, Pune-19", b=True, sz=26, color='111111'), align='center', after=60)}
{para(run("T. Y. MONTHLY SYLLABUS PROGRESS REPORT - A.Y. 2025-26 (TERM II)", b=True, sz=22, color='1e293b'), align='center', after=30)}
{para(run("MONTH: MAY 2026 (Upto 19th May)", b=True, sz=20, color='475569'), align='center', after=180)}
{table_xml}
{para('', after=800)}
{sign_tbl}
<w:sectPr>
  <w:pgSz w:w="{PAGE_W}" w:h="{PAGE_H}" w:orient="landscape"/>
  <w:pgMar w:top="{MARGIN_VERT}" w:right="{MARGIN_SIDE}" w:bottom="{MARGIN_VERT}" w:left="{MARGIN_SIDE}" w:header="720" w:footer="720" w:gutter="0"/>
</w:sectPr>
</w:body>
</w:document>'''

content_types = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>'''

rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>'''

out_path = 'C:/Users/PRANAV/Desktop/Syllabus_Progress_Report_Sample_v2.docx'
with zipfile.ZipFile(out_path, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', content_types)
    z.writestr('_rels/.rels', rels)
    z.writestr('word/document.xml', doc_xml)

print('Updated sample docx written to:', out_path)
