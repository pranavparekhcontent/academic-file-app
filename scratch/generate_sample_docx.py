import os
import zipfile
import xml.sax.saxutils

def escape(text):
    return xml.sax.saxutils.escape(str(text))

def build_docx(output_path):
    FONT = "Calibri"
    HEADER_BG = "383838"      # Charcoal gray for header
    ZEBRA_BG = "F7F7F7"       # Subtle row zebra
    BORDER_COLOR = "7F7F7F"   # Clean professional border
    
    # ── HELPERS ───────────────────────────────────────────
    def run(text, bold=False, sz=20, color=None, caps=False, italic=False):
        rPr = [f'<w:rFonts w:ascii="{FONT}" w:hAnsi="{FONT}" w:cs="{FONT}"/>']
        if bold:
            rPr.append('<w:b/>')
        if italic:
            rPr.append('<w:i/>')
        if caps:
            rPr.append('<w:caps/>')
        if color:
            rPr.append(f'<w:color w:val="{color}"/>')
        rPr.append(f'<w:sz w:val="{sz}"/>')
        
        lines = str(text).split('\n')
        text_nodes = '<w:br/>'.join([f'<w:t xml:space="preserve">{escape(line)}</w:t>' for line in lines])
        return f'<w:r><w:rPr>{"".join(rPr)}</w:rPr>{text_nodes}</w:r>'

    def para(runs_xml, align=None, after=120, before=0, line=240):
        pPr = [f'<w:spacing w:before="{before}" w:after="{after}" w:line="{line}" w:lineRule="auto"/>']
        if align:
            pPr.append(f'<w:jc w:val="{align}"/>')
        return f'<w:p><w:pPr>{"".join(pPr)}</w:pPr>{runs_xml}</w:p>'

    def cell(runs_xml, width=None, shade=None, align="left", v_align="center"):
        tcPr = [f'<w:vAlign w:val="{v_align}"/>']
        if width:
            tcPr.append(f'<w:tcW w:w="{width}" w:type="dxa"/>')
        if shade:
            tcPr.append(f'<w:shd w:val="clear" w:color="auto" w:fill="{shade}"/>')
        pPr = ['<w:spacing w:before="35" w:after="35" w:line="240" w:lineRule="auto"/>']
        if align:
            pPr.append(f'<w:jc w:val="{align}"/>')
        return f'<w:tc><w:tcPr>{"".join(tcPr)}</w:tcPr><w:p><w:pPr>{"".join(pPr)}</w:pPr>{runs_xml}</w:p></w:tc>'

    def table(cols, rows_xml, borders=True):
        tbl_w = sum(cols)
        grid = "".join([f'<w:gridCol w:w="{w}"/>' for w in cols])
        bdr = (
            f'<w:tblBorders>'
            f'<w:top w:val="single" w:sz="4" w:color="{BORDER_COLOR}"/><w:left w:val="single" w:sz="4" w:color="{BORDER_COLOR}"/>'
            f'<w:bottom w:val="single" w:sz="4" w:color="{BORDER_COLOR}"/><w:right w:val="single" w:sz="4" w:color="{BORDER_COLOR}"/>'
            f'<w:insideH w:val="single" w:sz="4" w:color="{BORDER_COLOR}"/><w:insideV w:val="single" w:sz="4" w:color="{BORDER_COLOR}"/>'
            f'</w:tblBorders>'
            if borders else
            f'<w:tblBorders><w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/><w:insideH w:val="none"/><w:insideV w:val="none"/></w:tblBorders>'
        )
        return (
            f'<w:tbl><w:tblPr>'
            f'<w:tblW w:w="{tbl_w}" w:type="dxa"/>'
            f'<w:jc w:val="center"/>'
            f'<w:tblLayout w:type="fixed"/>'
            f'{bdr}'
            f'<w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar>'
            f'</w:tblPr>{grid}{rows_xml}</w:tbl>'
        )

    # ── DOCUMENT CONTENTS ─────────────────────────────────
    
    # 1. Management and College Header
    mgmt_name = "SINHGAD TECHNICAL EDUCATION SOCIETY'S"
    college_name = "RMD INSTITUTE OF PHARMACEUTICAL EDUCATION & RESEARCH"
    college_sub = "S. No. 111/1, Warje, Pune – 411058"
    notice_title = "Third Year (SEM VI) Defaulter Students List"
    academic_year = "Academic Year 2025-26 (TERM II)"
    
    header_xml = (
        para(run(mgmt_name, bold=True, sz=20, caps=True), align="center", after=30) +
        para(run(college_name, bold=True, sz=26), align="center", after=30) +
        para(run(college_sub, sz=17, color="555555"), align="center", after=80) +
        para(run(notice_title, bold=True, sz=24), align="center", after=40) +
        para(run(academic_year, bold=True, sz=20), align="center", after=160)
    )

    # 2. Official Notice Body
    notice_text = (
        "All the Third Year B. Pharm students are informed that below is the list of defaulter students. "
        "The students must be present in college for Theory as well as practical otherwise strict action "
        "will be taken and will not be eligible for the sessional examination."
    )
    notice_body_xml = para(run(notice_text, sz=20), align="both", after=140, line=260)

    # 3. Defaulters Period Sub-header
    period_xml = para(run("Defaulters: (01/01/2026 - 10/02/2026)", bold=True, sz=20), align="left", after=90)

    # 4. Defaulters Roster in 4 Columns (2-Up side by side)
    # Total content width = 9746 twips
    # Col 1: 1100, Col 2: 3773, Col 3: 1100, Col 4: 3773
    def_cols = [1100, 3773, 1100, 3773]
    
    def_th = lambda txt: run(txt, bold=True, sz=19, color="FFFFFF")
    
    def_header_row = (
        '<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>' +
        cell(def_th("Roll No."), width=1100, shade=HEADER_BG, align="center") +
        cell(def_th("Name of Student"), width=3773, shade=HEADER_BG, align="left") +
        cell(def_th("Roll No."), width=1100, shade=HEADER_BG, align="center") +
        cell(def_th("Name of Student"), width=3773, shade=HEADER_BG, align="left") +
        '</w:tr>'
    )

    # Sample Defaulter Students list from User's prompt
    sample_defaulters = [
        (22, "DOSHI SIDDHAM DIPAK", 24, "DUSANE GAURANG AJIT"),
        (27, "GAIKWAD SUMEDH ARUN", 34, "JAIN CHANDAN SANTOSH"),
        (47, "MAHIMKAR ATHARVA SANJAY", 63, "PATIL RIYA SUBHASH"),
        (76, "SALUNKHE NIDHI RAJENDRA", 82, "UNHALKAR ADITYA SUNIL"),
        (83, "VAIBHAV SUDHIR JAGADALE", 85, "WANI PRASANNATA KAILAS"),
        (86, "WANKHADE PRANAV KISHOR", 92, "AMBODKAR SHREYASH GANESH"),
        (93, "BEDMUTHA KHUSHI MAHAVEER", 95, "DOBHADA SAMAY MAHENDRA"),
        (96, "DOSHI PRATHMESH PANKAJ", 97, "DOSHI SUJAL SANJAY"),
        (98, "GANDHI CHIRAG PRAVIN", 100, "GUGALE ARIHANT SHITALKUMAR"),
        (101, "HULAWALE ROHAN NAVNATH", 102, "ISHIKA VIJAY JAWALKAR"),
        (104, "JAIN BHAVESH MANOJ", 105, "KOTHEKAR SAKSHI (FROM BACKLOG)"),
        (107, "NANDRE JEETESH PRAKASH", 108, "SANGHAVI DARSHAN KIRAN"),
        (109, "SAYYAD MOHAMAD SAQLAIN T.", 113, "GANDHI NISARG"),
        (115, "WANKHEDE KHUSHI", 116, "YEOLE GAYATRI"),
    ]

    def_rows_xml = ""
    for idx, (r1, n1, r2, n2) in enumerate(sample_defaulters):
        shade = ZEBRA_BG if idx % 2 == 1 else None
        def_rows_xml += (
            '<w:tr><w:trPr><w:cantSplit/></w:trPr>' +
            cell(run(str(r1), bold=True, sz=19), width=1100, shade=shade, align="center") +
            cell(run(n1, sz=19), width=3773, shade=shade, align="left") +
            cell(run(str(r2), bold=True, sz=19), width=1100, shade=shade, align="center") +
            cell(run(n2, sz=19), width=3773, shade=shade, align="left") +
            '</w:tr>'
        )

    defaulters_table_xml = table(def_cols, def_header_row + def_rows_xml)

    # 5. Spacing and Subject Teachers Acknowledgment Section
    ack_heading_xml = para(run("Subject Teachers Acknowledgment", bold=True, sz=22), align="left", before=200, after=90)
    
    ack_cols = [5246, 3100, 1400]
    ack_header_row = (
        '<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>' +
        cell(def_th("Subject"), width=5246, shade=HEADER_BG, align="left") +
        cell(def_th("Teacher"), width=3100, shade=HEADER_BG, align="left") +
        cell(def_th("Sign"), width=1400, shade=HEADER_BG, align="center") +
        '</w:tr>'
    )

    sample_subjects = [
        "BP601T Medicinal Chemistry III – Theory",
        "BP602T Pharmacology III – Theory",
        "BP603T Herbal Drug Technology – Theory",
        "BP604T Biopharmaceutics and Pharmacokinetics – Theory",
        "BP605T Pharmaceutical Biotechnology – Theory",
        "BP606T Quality Assurance – Theory"
    ]

    ack_rows_xml = ""
    for idx, subj in enumerate(sample_subjects):
        shade = ZEBRA_BG if idx % 2 == 1 else None
        # Row with height to accommodate signature
        ack_rows_xml += (
            '<w:tr><w:trPr><w:trHeight w:val="420" w:hRule="atLeast"/><w:cantSplit/></w:trPr>' +
            cell(run(subj, bold=True, sz=18), width=5246, shade=shade, align="left") +
            cell(run("", sz=18), width=3100, shade=shade, align="left") +
            cell(run("", sz=18), width=1400, shade=shade, align="center") +
            '</w:tr>'
        )

    ack_table_xml = table(ack_cols, ack_header_row + ack_rows_xml)

    # 6. Signatories Table
    third = 9746 // 3
    sign_cols = [third, third, 9746 - (2 * third)]
    sign_table_xml = table(sign_cols,
        '<w:tr><w:trPr><w:cantSplit/></w:trPr>' +
        cell(run("Class Teacher", bold=True, sz=22), align="left") +
        cell(run("Academic In-charge", bold=True, sz=22), align="center") +
        cell(run("Principal", bold=True, sz=22), align="right") +
        '</w:tr>',
        borders=False
    )

    # 7. Complete Body and Section Setup
    body_xml = (
        header_xml +
        notice_body_xml +
        period_xml +
        defaulters_table_xml +
        ack_heading_xml +
        ack_table_xml +
        para("", after=850) +   # Gap for signatures
        sign_table_xml +
        '<w:sectPr>' +
          '<w:pgSz w:w="11906" w:h="16838"/>' +
          '<w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:header="720" w:footer="720" w:gutter="0"/>' +
        '</w:sectPr>'
    )

    document_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        f'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f'<w:body>{body_xml}</w:body>'
        f'</w:document>'
    )

    content_types_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n'
        '  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n'
        '  <Default Extension="xml" ContentType="application/xml"/>\n'
        '  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>\n'
        '</Types>'
    )

    root_rels_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n'
        '  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>\n'
        '</Relationships>'
    )

    with zipfile.ZipFile(output_path, 'w', compression=zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml', content_types_xml)
        z.writestr('_rels/.rels', root_rels_xml)
        z.writestr('word/document.xml', document_xml)

    print(f"Successfully generated DOCX at: {output_path}")

if __name__ == "__main__":
    desktop = os.path.join(os.environ.get("USERPROFILE", "C:\\Users\\PRANAV"), "Desktop")
    out_file = os.path.join(desktop, "Defaulter_Students_List_Sample.docx")
    build_docx(out_file)
