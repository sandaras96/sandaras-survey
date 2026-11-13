// ============================================================================
//  NICU BABY IN INCUBATOR  -  flat vector illustration builder
//  Adobe Illustrator ExtendScript   (File > Scripts > Other Script...)
//
//  BUILT SO FAR :  document + full layer stack, background, monitors,
//                  incubator (stage 1) and organs overlay + labels (stage 4).
//  STILL TO COME :  baby (stage 2), tubes / wires / tapes (stage 3).
//                  Their layers are already created, empty.
//
//  Everything is drawn from scratch as bezier paths (no tracing, no images).
//  Design coordinates are 1920 x 1080 px, origin top-left, y pointing down;
//  helpers convert them to Illustrator's coordinate system.
// ============================================================================
#target illustrator

(function () {

    var STAGES_BUILT = '1 (background, monitors, incubator) + 4 (organs, labels)';
    var W = 1920, H = 1080; // artboard size in px

    // ------------------------------------------------------------------------
    //  PALETTE  (flat colors only)
    // ------------------------------------------------------------------------
    var COL = {
        // wall
        wall:        '#AAA9D3',
        wallLight:   '#B4B4DC',
        wallBand:    '#8B8BBB',
        gridLine:    '#FFFFFF',
        // monitors / devices
        mon:         '#D1D0F0',
        monPort:     '#C8C6EC',
        monPortL:    '#DCDBF3',
        monScreenL:  '#F3F3FB',
        monScreenR:  '#B8B8EA',
        monTextLine: '#C9C7EA',
        monButton:   '#B6B3E1',
        monDot:      '#B3B1DF',
        graphPink:   '#B57BC9',
        white:       '#FFFFFF',
        offWhite:    '#F5F5FC',
        // ventilator connector
        valve:       '#7A71C9',
        valveCore:   '#6359B9',
        valvePipe:   '#736BC4',
        barrel:      '#D3D1F0',
        barrelIn:    '#B9B6E4',
        barrelLight: '#E7E6F8',
        barrelBand:  '#8F88D4',
        canister:    '#D2D0F0',
        canisterTop: '#E1E0F6',
        // incubator
        incBody:     '#F7D5B3',
        incShade:    '#F4CEA9',
        incPanelR:   '#FAE7D2',
        incTray:     '#FAE3CB',
        incPad:      '#F7CFA4',
        incRim:      '#D4D1EE',
        // portholes (left side = shadow side, right side = lit side)
        phRingL:     '#BBB5D8',
        phInL:       '#F3B78C',
        phInLightL:  '#F5C39B',
        phRingR:     '#CFC7E3',
        phInR:       '#F6CFA6',
        phInLightR:  '#F8D8B3',
        // organs
        brainGlow:   '#EE7680',
        brainBack:   '#E9777F',
        brainFront:  '#F28C9A',
        brainFoldB:  '#D35E6C',
        brainFold:   '#D2697A',
        lungGlow:    '#EE8590',
        lung:        '#EE8E9B',
        lungLight:   '#F09AA6',
        lungDark:    '#A35E7B',
        airway:      '#F4BCC3',
        bronchus:    '#F7CBD2',
        bronchiole:  '#F9D9DE',
        gutGlow:     '#EF8792',
        colon:       '#EE8F9B',
        colonLine:   '#DC7183',
        smallInt:    '#E3576C',
        smallIntFold:'#C33D55',
        // labels
        titleBox:    '#564395',
        labelBox:    '#FFFFFF',
        labelText:   '#3A3150',
        leader:      '#FFFFFF'
    };

    // ------------------------------------------------------------------------
    //  DOCUMENT
    // ------------------------------------------------------------------------
    var doc = makeDocument();
    try { app.coordinateSystem = CoordinateSystem.ARTBOARDCOORDINATESYSTEM; } catch (e0) {}
    var AB = doc.artboards[0].artboardRect;   // [left, top, right, bottom]

    function X(x) { return AB[0] + x; }   // design x -> Illustrator x
    function Y(y) { return AB[1] - y; }   // design y (down) -> Illustrator y (up)

    function makeDocument() {
        var d = null;
        try {
            var pre = new DocumentPreset();
            pre.width = W;
            pre.height = H;
            pre.colorMode = DocumentColorSpace.RGB;
            pre.units = RulerUnits.Pixels;
            pre.title = 'NICU_Baby_Incubator';
            d = app.documents.addDocument('Web', pre, false);
        } catch (e1) {
            d = null;
        }
        if (!d) { d = app.documents.add(DocumentColorSpace.RGB, W, H); }
        return d;
    }

    // ------------------------------------------------------------------------
    //  COLOR / MATRIX HELPERS
    // ------------------------------------------------------------------------
    function rgb(hex) {
        var c = new RGBColor();
        c.red = parseInt(hex.substr(1, 2), 16);
        c.green = parseInt(hex.substr(3, 2), 16);
        c.blue = parseInt(hex.substr(5, 2), 16);
        return c;
    }

    // 2D affine matrices [a, b, c, d, e, f]:  x' = a*x + c*y + e,  y' = b*x + d*y + f
    function ROT(deg, cx, cy) {       // rotate around (cx,cy); positive = clockwise on screen
        var r = deg * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r);
        return [cs, sn, -sn, cs, cx - cs * cx + sn * cy, cy - sn * cx - cs * cy];
    }
    function MIRX(axisX) { return [-1, 0, 0, 1, 2 * axisX, 0]; }   // mirror left/right
    function MOVE(dx, dy) { return [1, 0, 0, 1, dx, dy]; }
    function SCALE(k, cx, cy) { return [k, 0, 0, k, cx - k * cx, cy - k * cy]; }
    function mul(A, B) {   // A after B
        return [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1],
                A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
                A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]];
    }
    function apply(m, x, y) { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }

    function r2(n) { return Math.round(n * 100) / 100; }

    // ------------------------------------------------------------------------
    //  GEOMETRY  ->  SVG-style path strings  (M L H V C S Q Z, abs + rel)
    // ------------------------------------------------------------------------
    var K = 0.5522847;   // bezier circle constant

    // rounded rectangle; r = number or [tl, tr, br, bl]
    function rrect(x, y, w, h, r) {
        var tl, tr, br, bl;
        if (r instanceof Array) { tl = r[0]; tr = r[1]; br = r[2]; bl = r[3]; }
        else { tl = tr = br = bl = (r || 0); }
        var s = 'M' + r2(x + tl) + ' ' + r2(y);
        s += ' L' + r2(x + w - tr) + ' ' + r2(y);
        if (tr) s += ' C' + r2(x + w - tr + tr * K) + ' ' + r2(y) + ' ' + r2(x + w) + ' ' + r2(y + tr - tr * K) + ' ' + r2(x + w) + ' ' + r2(y + tr);
        s += ' L' + r2(x + w) + ' ' + r2(y + h - br);
        if (br) s += ' C' + r2(x + w) + ' ' + r2(y + h - br + br * K) + ' ' + r2(x + w - br + br * K) + ' ' + r2(y + h) + ' ' + r2(x + w - br) + ' ' + r2(y + h);
        s += ' L' + r2(x + bl) + ' ' + r2(y + h);
        if (bl) s += ' C' + r2(x + bl - bl * K) + ' ' + r2(y + h) + ' ' + r2(x) + ' ' + r2(y + h - bl + bl * K) + ' ' + r2(x) + ' ' + r2(y + h - bl);
        s += ' L' + r2(x) + ' ' + r2(y + tl);
        if (tl) s += ' C' + r2(x) + ' ' + r2(y + tl - tl * K) + ' ' + r2(x + tl - tl * K) + ' ' + r2(y) + ' ' + r2(x + tl) + ' ' + r2(y);
        return s + ' Z';
    }

    function rect(x, y, w, h) { return rrect(x, y, w, h, 0); }

    // ellipse with 4 anchors (top, right, bottom, left)
    function ellipse(cx, cy, rx, ry) {
        var kx = rx * K, ky = ry * K;
        return 'M' + r2(cx) + ' ' + r2(cy - ry) +
            ' C' + r2(cx + kx) + ' ' + r2(cy - ry) + ' ' + r2(cx + rx) + ' ' + r2(cy - ky) + ' ' + r2(cx + rx) + ' ' + r2(cy) +
            ' C' + r2(cx + rx) + ' ' + r2(cy + ky) + ' ' + r2(cx + kx) + ' ' + r2(cy + ry) + ' ' + r2(cx) + ' ' + r2(cy + ry) +
            ' C' + r2(cx - kx) + ' ' + r2(cy + ry) + ' ' + r2(cx - rx) + ' ' + r2(cy + ky) + ' ' + r2(cx - rx) + ' ' + r2(cy) +
            ' C' + r2(cx - rx) + ' ' + r2(cy - ky) + ' ' + r2(cx - kx) + ' ' + r2(cy - ry) + ' ' + r2(cx) + ' ' + r2(cy - ry) + ' Z';
    }

    function circle(cx, cy, r) { return ellipse(cx, cy, r, r); }

    // straight polyline / polygon from [[x,y],...]
    function poly(pts, closed) {
        var s = 'M' + r2(pts[0][0]) + ' ' + r2(pts[0][1]);
        for (var i = 1; i < pts.length; i++) s += ' L' + r2(pts[i][0]) + ' ' + r2(pts[i][1]);
        return closed ? s + ' Z' : s;
    }

    // smooth curve through points (Catmull-Rom converted to cubic beziers)
    function smooth(pts, closed) {
        var n = pts.length, s = 'M' + r2(pts[0][0]) + ' ' + r2(pts[0][1]), i;
        var segs = closed ? n : n - 1;
        for (i = 0; i < segs; i++) {
            var p0 = pts[closed ? (i - 1 + n) % n : Math.max(i - 1, 0)];
            var p1 = pts[i], p2 = pts[(i + 1) % n];
            var p3 = pts[closed ? (i + 2) % n : Math.min(i + 2, n - 1)];
            s += ' C' + r2(p1[0] + (p2[0] - p0[0]) / 6) + ' ' + r2(p1[1] + (p2[1] - p0[1]) / 6) + ' ' +
                r2(p2[0] - (p3[0] - p1[0]) / 6) + ' ' + r2(p2[1] - (p3[1] - p1[1]) / 6) + ' ' + r2(p2[0]) + ' ' + r2(p2[1]);
        }
        return closed ? s + ' Z' : s;
    }

    // lumpy edge (brain lobes, gut haustra): from 'from' through pts, each segment
    // bulges outward by h * its length. Outward = correct for clockwise outlines;
    // pass a negative h when travelling counter-clockwise.
    function lumps(from, pts, h) {
        var s = '', a = from, i;
        for (i = 0; i < pts.length; i++) {
            var b = pts[i], dx = b[0] - a[0], dy = b[1] - a[1], nx = dy * h, ny = -dx * h;
            s += ' C' + r2(a[0] + dx * 0.15 + nx) + ' ' + r2(a[1] + dy * 0.15 + ny) + ' ' +
                r2(b[0] - dx * 0.15 + nx) + ' ' + r2(b[1] - dy * 0.15 + ny) + ' ' + r2(b[0]) + ' ' + r2(b[1]);
            a = b;
        }
        return s;
    }
    function cloud(pts, h) {
        return 'M' + r2(pts[0][0]) + ' ' + r2(pts[0][1]) + lumps(pts[0], pts.slice(1).concat([pts[0]]), h) + ' Z';
    }

    // ------------------------------------------------------------------------
    //  PATH PARSER  ->  subpaths of bezier nodes {x,y, lx,ly (in), rx,ry (out)}
    // ------------------------------------------------------------------------
    function parsePath(d) {
        var tok = d.match(/[MmLlHhVvCcSsQqZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g);
        var subs = [], cur = null, i = 0, cmd = '', cx = 0, cy = 0, sx = 0, sy = 0;
        var lastC2 = null, lastCmd = '';
        function num() { return parseFloat(tok[i++]); }
        function isCmd(t) { return /^[A-Za-z]$/.test(t); }
        function node(x, y) { return { x: x, y: y, lx: x, ly: y, rx: x, ry: y }; }
        function last() { return cur.pts[cur.pts.length - 1]; }
        function lineTo(x, y) {
            if (Math.abs(x - cx) < 0.001 && Math.abs(y - cy) < 0.001) return;
            cur.pts.push(node(x, y)); cx = x; cy = y;
        }
        function curveTo(x1, y1, x2, y2, x, y) {
            if (Math.abs(x - cx) < 0.001 && Math.abs(y - cy) < 0.001 &&
                Math.abs(x1 - cx) < 0.001 && Math.abs(y1 - cy) < 0.001) return;
            var p = last(); p.rx = x1; p.ry = y1;
            var n = node(x, y); n.lx = x2; n.ly = y2; cur.pts.push(n);
            cx = x; cy = y; lastC2 = [x2, y2];
        }
        while (i < tok.length) {
            if (isCmd(tok[i])) cmd = tok[i++];
            var rel = (cmd === cmd.toLowerCase()) && cmd !== 'z' && cmd !== 'Z';
            var C = cmd.toUpperCase(), ox = rel ? cx : 0, oy = rel ? cy : 0;
            if (C === 'M') {
                var mx = num() + ox, my = num() + oy;
                cur = { pts: [node(mx, my)], closed: false }; subs.push(cur);
                cx = sx = mx; cy = sy = my;
                cmd = rel ? 'l' : 'L';
            } else if (C === 'L') { var lx = num() + ox, ly = num() + oy; lineTo(lx, ly); }
            else if (C === 'H') { lineTo(num() + ox, cy); }
            else if (C === 'V') { lineTo(cx, num() + (rel ? cy : 0)); }
            else if (C === 'C') {
                var a1 = num() + ox, b1 = num() + oy, a2 = num() + ox, b2 = num() + oy, a3 = num() + ox, b3 = num() + oy;
                curveTo(a1, b1, a2, b2, a3, b3);
            } else if (C === 'S') {
                var rx1 = cx, ry1 = cy;
                if (lastC2 && (lastCmd === 'C' || lastCmd === 'S')) { rx1 = 2 * cx - lastC2[0]; ry1 = 2 * cy - lastC2[1]; }
                var s2 = num() + ox, t2 = num() + oy, s3 = num() + ox, t3 = num() + oy;
                curveTo(rx1, ry1, s2, t2, s3, t3);
            } else if (C === 'Q') {
                var qx = num() + ox, qy = num() + oy, ex = num() + ox, ey = num() + oy;
                curveTo(cx + 2 / 3 * (qx - cx), cy + 2 / 3 * (qy - cy), ex + 2 / 3 * (qx - ex), ey + 2 / 3 * (qy - ey), ex, ey);
            } else if (C === 'Z') {
                var f = cur.pts[0], l = last();
                if (cur.pts.length > 1 && Math.abs(f.x - l.x) < 0.01 && Math.abs(f.y - l.y) < 0.01) {
                    f.lx = l.lx; f.ly = l.ly; cur.pts.pop();
                }
                cur.closed = true; cx = sx; cy = sy;
            } else { i++; }
            lastCmd = C;
        }
        return subs;
    }

    // ------------------------------------------------------------------------
    //  ILLUSTRATOR OBJECT HELPERS
    // ------------------------------------------------------------------------
    function isSmooth(n) {
        var ax = n.lx - n.x, ay = n.ly - n.y, bx = n.rx - n.x, by = n.ry - n.y;
        var la = Math.sqrt(ax * ax + ay * ay), lb = Math.sqrt(bx * bx + by * by);
        if (la < 0.01 || lb < 0.01) return false;
        return Math.abs((ax * by - ay * bx) / (la * lb)) < 0.02 && (ax * bx + ay * by) < 0;
    }

    function buildPathItem(container, sp, m) {
        var p = container.pathItems.add();
        for (var i = 0; i < sp.pts.length; i++) {
            var n = sp.pts[i];
            var a = [n.x, n.y], l = [n.lx, n.ly], r = [n.rx, n.ry];
            if (m) { a = apply(m, a[0], a[1]); l = apply(m, l[0], l[1]); r = apply(m, r[0], r[1]); }
            var q = p.pathPoints.add();
            q.anchor = [X(a[0]), Y(a[1])];
            q.leftDirection = [X(l[0]), Y(l[1])];
            q.rightDirection = [X(r[0]), Y(r[1])];
            q.pointType = isSmooth(n) ? PointType.SMOOTH : PointType.CORNER;
        }
        p.closed = sp.closed;
        try { p.pixelAligned = false; } catch (e) {}
        return p;
    }

    function styleItem(p, st) {
        if (st.f) { p.filled = true; p.fillColor = rgb(st.f); } else { p.filled = false; }
        if (st.s) {
            p.stroked = true;
            p.strokeColor = rgb(st.s);
            p.strokeWidth = st.w || 1;
            p.strokeCap = (st.cap === 'butt') ? StrokeCap.BUTTENDCAP : StrokeCap.ROUNDENDCAP;
            p.strokeJoin = (st.join === 'miter') ? StrokeJoin.MITERENDJOIN : StrokeJoin.ROUNDENDJOIN;
            if (st.dash) p.strokeDashes = st.dash;
        } else { p.stroked = false; }
    }

    // shape(container, name, pathString, style)
    //   style: { f: fill hex | null, s: stroke hex, w: stroke width, o: opacity 0-100,
    //            cap: 'round'|'butt', dash: [..], m: affine matrix }
    function shape(container, name, d, st) {
        st = st || {};
        var subs = parsePath(d), item, i;
        if (subs.length === 1) {
            item = buildPathItem(container, subs[0], st.m);
            styleItem(item, st);
        } else {
            item = container.compoundPathItems.add();
            for (i = 0; i < subs.length; i++) {
                var sp = buildPathItem(item, subs[i], st.m);
                styleItem(sp, st);
            }
        }
        item.name = name;
        if (st.o !== undefined && st.o !== null) item.opacity = st.o;
        return item;
    }

    function group(container, name) {
        var g = container.groupItems.add();
        g.name = name;
        return g;
    }

    function pad2(n) { return (n < 10 ? '0' : '') + n; }

    // ------------------------------------------------------------------------
    //  LAYER STACK  (bottom -> top)
    // ------------------------------------------------------------------------
    var LAYER_ORDER = [
        'BG_Wall_Grid',
        'Monitors_Left', 'Monitors_Right',
        'Incubator_Base', 'Incubator_Glass', 'Incubator_Portholes',
        'Baby_Body',
        'Baby_Face',
        'Hat',
        'Diaper', 'Umbilical_Clamp',
        'Tubes_Wires',
        'Tapes_Sensors',
        'Organs_Overlay',
        'Labels_Text'
    ];
    var BODY_SUBLAYERS = ['Legs', 'Feet', 'Torso', 'Arms', 'Hands', 'Head'];   // bottom -> top

    var LY = {}, i;
    LY[LAYER_ORDER[0]] = doc.layers[0];
    doc.layers[0].name = LAYER_ORDER[0];
    for (i = 1; i < LAYER_ORDER.length; i++) {
        LY[LAYER_ORDER[i]] = doc.layers.add();
        LY[LAYER_ORDER[i]].name = LAYER_ORDER[i];
    }
    for (i = 0; i < LAYER_ORDER.length; i++) LY[LAYER_ORDER[i]].zOrder(ZOrderMethod.BRINGTOFRONT);

    var BODY = {};
    for (i = 0; i < BODY_SUBLAYERS.length; i++) {
        BODY[BODY_SUBLAYERS[i]] = LY.Baby_Body.layers.add();
        BODY[BODY_SUBLAYERS[i]].name = BODY_SUBLAYERS[i];
    }
    for (i = 0; i < BODY_SUBLAYERS.length; i++) BODY[BODY_SUBLAYERS[i]].zOrder(ZOrderMethod.BRINGTOFRONT);

    function sublayers(parent, names) {
        var out = {}, j;
        for (j = 0; j < names.length; j++) { out[names[j]] = parent.layers.add(); out[names[j]].name = names[j]; }
        for (j = 0; j < names.length; j++) out[names[j]].zOrder(ZOrderMethod.BRINGTOFRONT);
        return out;
    }
    var ORG = sublayers(LY.Organs_Overlay, ['Brain', 'Lungs', 'Intestines']);
    var LBL = sublayers(LY.Labels_Text, ['Title_Label', 'Label_Neurological', 'Label_Respiratory', 'Label_Gut']);

    // ========================================================================
    //  STAGE 1  -  BACKGROUND WALL + GRID
    // ========================================================================
    function buildBackground(L) {
        shape(L, 'Wall_Base', rect(0, 0, W, H), { f: COL.wall });
        // soft light falling diagonally on the lower-right wall
        shape(L, 'Wall_Light_Diagonal', poly([[1380, 592], [1920, 265], [1920, 1080], [1380, 1080]], true), { f: COL.wallLight });
        // darker vertical band (shadow of the incubator column) on the left
        shape(L, 'Wall_Shadow_Band_L', rect(291, 0, 140, H), { f: COL.wallBand });

        var g = group(L, 'Wall_Grid_Lines'), k;
        var vx = [218, 469, 720, 971, 1222, 1473, 1724];
        var hy = [12, 263, 514, 765, 1016];
        for (k = 0; k < vx.length; k++)
            shape(g, 'Grid_V_' + pad2(k + 1), poly([[vx[k], 0], [vx[k], H]]), { s: COL.gridLine, w: 2.5, cap: 'butt', o: 20 });
        for (k = 0; k < hy.length; k++)
            shape(g, 'Grid_H_' + pad2(k + 1), poly([[0, hy[k]], [W, hy[k]]]), { s: COL.gridLine, w: 2.5, cap: 'butt', o: 20 });
    }

    // ========================================================================
    //  STAGE 1  -  MONITORS
    // ========================================================================
    function buildMonitorLeft(L) {
        var m = group(L, 'Monitor_L'), k;
        shape(m, 'MonL_Body', rrect(-30, -30, 292, 317, 14), { f: COL.mon });
        shape(m, 'MonL_Header_Dashes', poly([[10, 24], [250, 24]]), { s: COL.white, w: 3, cap: 'butt', dash: [18, 10] });
        shape(m, 'MonL_Screen', rrect(-30, 48, 258, 167, [0, 6, 6, 0]), { f: COL.monScreenL });
        shape(m, 'MonL_Graph_Line', poly([[-5, 108], [37, 108], [50, 101], [56, 107], [77, 100], [81, 114], [87, 108],
            [127, 108], [145, 101], [152, 107], [162, 101], [167, 115], [172, 108], [205, 108], [222, 101], [228, 105]]),
            { s: COL.graphPink, w: 3 });
        var cols = [[12, 65], [84, 136], [156, 210]], rows = [155, 170, 186], c, r;
        var tl = group(m, 'MonL_Text_Lines');
        for (c = 0; c < cols.length; c++)
            for (r = 0; r < rows.length; r++)
                shape(tl, 'MonL_TextLine_' + (c + 1) + '_' + (r + 1), poly([[cols[c][0], rows[r]], [cols[c][1], rows[r]]]),
                    { s: COL.monTextLine, w: 3 });
        var bx = [22, 78, 134, 190], bg = group(m, 'MonL_Buttons');
        for (k = 0; k < bx.length; k++)
            shape(bg, 'MonL_Button_' + (k + 1), circle(bx[k], 252, 18), { s: COL.monButton, w: 2.5 });
        shape(m, 'MonL_Tube_Port', rrect(258, 172, 36, 38, 8), { f: COL.monPortL });

        // ventilator Y-piece / connector on the wall (left middle)
        var v = group(L, 'Vent_Connector');
        shape(v, 'Vent_Pipe', rect(-20, 432, 110, 38), { f: COL.valvePipe });
        shape(v, 'Vent_Canister', 'M15 490 L15 532 C15 540.3 27.8 546 43.5 546 C59.2 546 72 540.3 72 532 L72 490 Z', { f: COL.canister });
        shape(v, 'Vent_Canister_Top', ellipse(43.5, 489, 28.5, 7), { f: COL.canisterTop });
        shape(v, 'Vent_Valve_Neck', rrect(31, 470, 25, 20, 4), { f: COL.valveCore });
        shape(v, 'Vent_Valve_Body', rrect(15, 400, 57, 80, 28.5), { f: COL.valve });
        shape(v, 'Vent_Valve_Body_Shade', 'M15 446 C24 456 34 460 43.5 460 C53 460 63 456 72 446 L72 451.5 C72 467.2 59.2 480 43.5 480 ' +
            'C27.8 480 15 467.2 15 451.5 Z', { f: COL.valveCore });
        shape(v, 'Vent_Valve_Core', circle(43.5, 428, 13), { f: COL.valveCore });
        shape(v, 'Vent_Barrel', rrect(90, 421, 97, 57, 5), { f: COL.barrel });
        shape(v, 'Vent_Barrel_Window_Light', rect(110, 434, 15, 31), { f: COL.barrelLight });
        shape(v, 'Vent_Barrel_Window', rect(128, 434, 59, 31), { f: COL.barrelIn });
        shape(v, 'Vent_Barrel_Band', rrect(123, 422, 6, 56, 3), { f: COL.barrelBand });
        shape(v, 'Vent_Collar', rect(186, 435, 11, 29), { f: COL.offWhite });
        shape(v, 'Vent_Ring', rrect(196, 415, 15, 67, 5), { f: COL.barrel });
        shape(v, 'Vent_Nozzle', 'M211 428 L230 428 C232 428 234 428.6 235.6 429.6 L260 444 C261.4 444.9 262.5 446.5 262.5 448.2 ' +
            'L262.5 455.8 C262.5 457.5 261.4 459.1 260 460 L235.6 471.4 C234 472.4 232 473 230 473 L211 473 Z', { f: COL.offWhite });
    }

    function buildMonitorRight(L) {
        var m = group(L, 'Monitor_R'), k;
        shape(m, 'MonR_Port_1', rrect(1487, 45, 26, 22, 6), { f: COL.monPort });
        shape(m, 'MonR_Port_2', rrect(1487, 80, 26, 22, 6), { f: COL.monPort });
        shape(m, 'MonR_Body', rrect(1505, -30, 455, 288, 16), { f: COL.mon });
        shape(m, 'MonR_Screen', rect(1547, 53, 413, 166), { f: COL.monScreenR });

        var dots = [1549, 1576, 1603, 1630, 1657], on = [false, false, true, false, true], dg = group(m, 'MonR_Indicators');
        for (k = 0; k < dots.length; k++) {
            if (on[k]) shape(dg, 'MonR_Indicator_' + (k + 1) + '_On', circle(dots[k], 19, 9.5), { f: COL.white });
            else shape(dg, 'MonR_Indicator_' + (k + 1), circle(dots[k], 19, 8.5), { s: COL.monDot, w: 2 });
        }
        shape(m, 'MonR_Label_Box', rect(1818, 9, 130, 26), { s: COL.white, w: 3, join: 'miter' });

        shape(m, 'MonR_Graph_Line', poly([[1547, 95], [1585, 95], [1602, 87], [1609, 95], [1633, 82], [1633, 104], [1648, 95],
            [1695, 95], [1711, 87], [1720, 95], [1745, 85], [1752, 102], [1767, 94], [1812, 94], [1835, 86], [1841, 94],
            [1854, 87], [1857, 103], [1872, 95], [1905, 95], [1925, 88]]), { s: COL.graphPink, w: 3 });

        // ECG trace: flat baseline + one QRS complex per beat
        var beats = [1582, 1642, 1700, 1756, 1814, 1872, 1930], amp = [1, 0.85, 1.05, 0.9, 1, 0.95, 1];
        var base = 173, pts = [[1547, base]];
        for (k = 0; k < beats.length; k++) {
            var p = beats[k], a = amp[k];
            pts.push([p - 23, base]);
            pts.push([p - 15, base - 21 * a]);
            pts.push([p - 11, base + 1]);
            pts.push([p - 1, base - 36 * a]);
            pts.push([p + 2, base + 24 * a]);
            pts.push([p + 8, base + 1]);
        }
        shape(m, 'MonR_ECG_Line', poly(pts), { s: COL.white, w: 3.5 });
    }

    // ========================================================================
    //  STAGE 1  -  INCUBATOR
    // ========================================================================
    function buildIncubatorBase(L) {
        shape(L, 'Inc_Body', rrect(409, -60, 1016, 1140, [0, 0, 32, 32]), { f: COL.incBody });
        shape(L, 'Inc_Body_Shade_L', 'M409 -60 L447 -60 L447 1080 L441 1080 C423.3 1080 409 1065.7 409 1048 Z', { f: COL.incShade });
        shape(L, 'Inc_Panel_R_Light', 'M1212 -60 L1418 -60 L1418 1008 C1418 1027.9 1401.9 1044 1382 1044 L1212 1044 Z', { f: COL.incPanelR });
        shape(L, 'Inc_Tray', rrect(572, -60, 718, 1104, [0, 0, 78, 78]), { f: COL.incTray });
        shape(L, 'Inc_Head_Pad', rrect(716, 205, 398, 252, 34), { f: COL.incPad, m: ROT(-2, 915, 331) });

        // hood rim + cable grommets along the top edge
        var rim = group(L, 'Inc_Top_Rim');
        shape(rim, 'Inc_Rim_Bar', rect(409, -20, 1016, 30), { f: COL.incRim });
        var tabs = [1233, 1260, 1290, 1320], k;
        for (k = 0; k < tabs.length; k++)
            shape(rim, 'Inc_Rim_Grommet_' + (k + 1), rrect(tabs[k] - 6.5, -5, 13, 32, 6.5), { f: COL.incRim });

        // display unit mounted on the hood (top-left)
        var disp = group(L, 'Inc_Top_Display');
        shape(disp, 'TopDisp_Lip', rrect(383, -20, 369, 55, 6), { f: COL.barrel });
        shape(disp, 'TopDisp_Body', rrect(383, -20, 369, 47, 6), { f: COL.offWhite });
    }

    function buildIncubatorGlass(L) {
        // soft diagonal reflections on the acrylic hood
        shape(L, 'Glass_Glare_Wide', poly([[409, 560], [1341, 10], [1425, 10], [1425, 401], [409, 1000]], true), { f: COL.white, o: 10 });
        shape(L, 'Glass_Glare_Thin', poly([[409, 420], [1104, 10], [1189, 10], [409, 470]], true), { f: COL.white, o: 14 });
        // bright edge on the right / bottom of the inner tray
        shape(L, 'Glass_Edge_Highlight', 'M1286 20 L1286 966 C1286 1006.9 1252.9 1040 1212 1040 L880 1040',
            { s: COL.white, w: 3, o: 75 });
    }

    function porthole(L, name, cx, cy, side) {
        var g = group(L, name), left = (side === 'L');
        // ring = visible inner wall of the porthole (crescent on the outer side)
        var ringCx = left ? cx : cx + 15, inCx = left ? cx + 16 : cx;
        shape(g, name + '_Ring', ellipse(ringCx, cy, left ? 34 : 35, 211), { f: left ? COL.phRingL : COL.phRingR });
        shape(g, name + '_Inner', ellipse(inCx, cy, left ? 27 : 26, 198), { f: left ? COL.phInL : COL.phInR });
        // lighter part of the inner wall, flush with the edge away from the ring
        if (left) shape(g, name + '_Inner_Light', ellipse(inCx + 8.5, cy + 3, 18.5, 192), { f: COL.phInLightL });
        else shape(g, name + '_Inner_Light', ellipse(inCx - 6, cy + 3, 20, 192), { f: COL.phInLightR });
        return g;
    }

    function buildPortholes(L) {
        porthole(L, 'Porthole_TL', 484, 339, 'L');
        porthole(L, 'Porthole_BL', 484, 839, 'L');
        porthole(L, 'Porthole_TR', 1342, 339, 'R');
        porthole(L, 'Porthole_BR', 1342, 839, 'R');
    }

    // ========================================================================
    //  STAGE 4  -  ORGANS OVERLAY  (hidden by default)
    //  Organ shapes are authored in the coordinates of the close-up reference
    //  (image 2) and mapped into this scene:  scene = 0.71 * closeUp + (254, 191)
    // ========================================================================
    var OV = [0.71, 0, 0, 0.71, 254, 191];

    function organ(container, name, d, st, extra) {
        var o = {}, k;
        for (k in st) o[k] = st[k];
        o.m = extra ? mul(OV, extra) : OV;
        if (o.w) o.w = o.w * OV[0];
        return shape(container, name, d, o);
    }

    function strokes(container, prefix, list, st) {
        var g = group(container, prefix + 's'), j;
        for (j = 0; j < list.length; j++) organ(g, prefix + '_' + pad2(j + 1), smooth(list[j], false), st);
        return g;
    }

    // ---------------------------------------------------------------- brain
    function buildBrain(L) {
        var hull = [[905, 40], [955, 22], [1005, 25], [1040, 42], [1075, 62], [1112, 90], [1132, 130], [1133, 185], [1118, 228],
            [1085, 262], [1040, 277], [995, 268], [955, 245], [925, 220], [890, 195], [868, 150], [866, 100], [880, 62]];
        organ(L, 'Brain_Glow_Outer', smooth(hull, true), { f: COL.brainGlow, o: 18 }, SCALE(1.07, 1000, 150));
        organ(L, 'Brain_Glow_Inner', smooth(hull, true), { f: COL.brainGlow, o: 28 }, SCALE(0.98, 1000, 150));

        organ(L, 'Brain_Back_Hemisphere', cloud([[908, 50], [950, 33], [995, 36], [1032, 55], [1048, 110], [1020, 190],
            [965, 228], [935, 218], [905, 188], [880, 148], [878, 98]], 0.22), { f: COL.brainBack });
        strokes(L, 'Brain_Back_Fold', [
            [[933, 50], [943, 57], [950, 67], [947, 74]],
            [[910, 80], [923, 77], [937, 81]],
            [[893, 93], [897, 107], [907, 113], [923, 110]],
            [[880, 143], [897, 150], [913, 153]],
            [[980, 58], [990, 47], [999, 43]],
            [[897, 118], [900, 130], [910, 134]],
            [[960, 46], [966, 56], [976, 60]],
            [[886, 120], [890, 128], [889, 136]],
            [[903, 165], [912, 170], [918, 180]],
            [[1010, 45], [1018, 50], [1022, 58]]
        ], { s: COL.brainFoldB, w: 2.9 });

        organ(L, 'Brain_Front_Hemisphere', cloud([[985, 70], [1022, 56], [1066, 78], [1098, 100], [1117, 135], [1117, 180],
            [1103, 220], [1075, 253], [1035, 262], [997, 250], [958, 226], [930, 197], [914, 160], [918, 118], [944, 90]], 0.2),
            { f: COL.brainFront });
        strokes(L, 'Brain_Fold', [
            [[953, 97], [967, 93], [997, 92]],
            [[972, 93], [975, 103], [973, 111]],
            [[942, 125], [960, 120], [987, 128], [1003, 120]],
            [[993, 93], [1007, 110], [1008, 127], [1002, 150], [997, 160]],
            [[1027, 75], [1037, 73], [1047, 83]],
            [[1050, 85], [1037, 97], [1023, 110], [1013, 123]],
            [[1067, 110], [1053, 117], [1037, 127], [1027, 143], [1017, 153]],
            [[1090, 117], [1073, 123], [1063, 137], [1050, 153], [1047, 167], [1037, 173]],
            [[1103, 140], [1090, 143], [1083, 153], [1080, 170], [1070, 177]],
            [[1090, 183], [1083, 180], [1067, 183], [1060, 197], [1057, 210]],
            [[1007, 167], [1020, 170], [1037, 173], [1050, 177]],
            [[950, 147], [963, 153], [977, 150], [990, 157], [1000, 167]],
            [[918, 160], [937, 157], [950, 162], [960, 173]],
            [[937, 183], [950, 183], [960, 193], [970, 183], [983, 177]],
            [[960, 197], [977, 197], [990, 203], [997, 217]],
            [[990, 210], [1007, 217], [1017, 227], [1023, 243]],
            [[1023, 197], [1037, 203], [1050, 210], [1053, 223]],
            [[1037, 227], [1050, 231], [1060, 243]],
            [[1077, 210], [1083, 223], [1087, 237]],
            [[977, 223], [983, 237], [993, 243]],
            [[933, 137], [943, 137], [950, 143]],
            [[925, 110], [935, 106], [944, 112]],
            [[1012, 72], [1006, 82], [1010, 92]],
            [[1080, 92], [1072, 100], [1074, 110]],
            [[1110, 160], [1100, 166], [1097, 178]],
            [[1105, 195], [1095, 200], [1094, 212]],
            [[1063, 240], [1070, 247], [1072, 255]],
            [[1012, 236], [1004, 240], [1003, 248]],
            [[944, 205], [953, 208], [958, 218]],
            [[1040, 140], [1030, 150], [1032, 160]],
            [[1060, 160], [1068, 165], [1066, 175]]
        ], { s: COL.brainFold, w: 2.9 });
    }

    // ---------------------------------------------------------------- lungs
    var LUNG_L = 'M912 401 C926 399 938 402 940 414 C942 450 941 500 941 538 C941 547 935 552 926 551 ' +
        'C905 549 885 550 872 552 C864 553 859 546 860 536 C860 495 866 452 884 424 C891 412 900 403 912 401 Z';

    function lung(L, side, shade) {
        var P = 'Lung_' + side, g = group(L, P), mir = (side === 'R') ? MIRX(953) : null, j;
        function M(m) { return mir ? (m ? mul(mir, m) : mir) : m; }
        organ(g, P + '_Glow', LUNG_L, { f: COL.lungGlow, o: 22 }, M(SCALE(1.09, 901, 477)));
        organ(g, P + '_Fill', LUNG_L, { f: COL.lung }, M(null));
        organ(g, P + '_Inner_Light', LUNG_L, { f: COL.lungLight }, M(SCALE(0.86, 903, 479)));
        var dg = group(g, P + '_Bronchial_Shading');
        for (j = 0; j < shade.length; j++)
            organ(dg, P + '_Shade_' + pad2(j + 1), shade[j][0], { s: COL.lungDark, w: shade[j][1], o: 80 }, M(null));
        var b = group(g, P + '_Bronchi');
        var branches = [
            'M926 466 C919 458 913 448 910 436 C908 428 907 420 906 412',
            'M912 452 C905 446 899 440 896 430',
            'M919 468 C908 467 896 466 884 470',
            'M912 488 C903 494 893 497 880 500',
            'M911 505 C900 512 890 516 875 524',
            'M912 495 C918 502 922 512 924 528',
            'M910 520 C905 530 898 538 892 545'
        ];
        for (j = 0; j < branches.length; j++) organ(b, P + '_Bronchus_' + pad2(j + 1), branches[j], { s: COL.bronchus, w: 2.6 }, M(null));
        var twigs = [
            'M906 425 C900 419 897 414 894 410', 'M908 430 C914 424 918 418 920 410', 'M896 432 C889 430 882 432 876 436',
            'M884 470 C877 466 872 464 866 466', 'M880 500 C874 504 869 510 866 518', 'M875 524 C870 530 868 538 867 545',
            'M924 528 C928 535 930 542 933 547', 'M893 481 C886 484 878 486 870 486', 'M918 480 C925 482 930 488 934 496',
            'M902 455 C895 456 888 452 882 446', 'M896 430 C894 422 895 415 899 408', 'M884 470 C880 476 874 480 868 480',
            'M890 498 C888 506 884 512 878 515', 'M901 512 C901 522 898 530 896 538', 'M911 470 C924 474 932 470 937 462',
            'M924 512 C930 512 935 516 937 522', 'M918 440 C924 438 930 432 934 424'
        ];
        for (j = 0; j < twigs.length; j++) organ(b, P + '_Bronchiole_' + pad2(j + 1), twigs[j], { s: COL.bronchiole, w: 1.4 }, M(null));
        return g;
    }

    function buildLungs(L) {
        // shading = [path, width]; drawn under the light bronchi
        lung(L, 'L', [
            ['M912 492 C911 506 910 520 909 534', 11],
            ['M912 490 C903 495 892 498 876 500', 9],
            ['M911 506 C900 512 890 517 876 523', 8],
            ['M905 500 C900 508 897 516 892 524', 7],
            ['M918 462 C912 458 908 452 906 444', 7],
            ['M909 434 C908 426 907 420 906 414', 5],
            ['M913 497 C918 504 921 512 922 522', 5],
            ['M882 485 C880 486 878 486 876 486', 6]
        ]);
        // right lung = mirrored left lung with its own shading (given on the left side, then mirrored)
        lung(L, 'R', [
            ['M926 466 C918 458 913 448 910 436 C908 428 907 420 906 414', 10],
            ['M912 452 C905 446 899 440 897 432', 7],
            ['M918 484 C910 484 898 484 888 486', 6],
            ['M912 492 C911 506 910 520 909 532', 6],
            ['M912 520 C907 526 904 530 903 534', 6],
            ['M930 488 C932 490 933 492 933 494', 6],
            ['M879 531 C878 532 877 532 876 532', 7]
        ]);
        var a = group(L, 'Airway');
        organ(a, 'Trachea', 'M953 378 L953 449', { s: COL.airway, w: 8 });
        organ(a, 'Main_Bronchus_L', 'M953 447 C947 456 934 462 926 466 C919 470 914 478 912 490 L910 538', { s: COL.airway, w: 5 });
        organ(a, 'Main_Bronchus_R', 'M953 447 C947 456 934 462 926 466 C919 470 914 478 912 490 L910 538', { s: COL.airway, w: 5 }, MIRX(953));
    }

    // ---------------------------------------------------------------- intestines
    function buildIntestines(L) {
        var glow = [[872, 609], [960, 605], [1042, 611], [1045, 680], [1043, 740], [1022, 752], [992, 752], [982, 790], [962, 808],
            [943, 802], [937, 762], [918, 770], [899, 767], [867, 744], [865, 670]];
        organ(L, 'Gut_Glow_Outer', smooth(glow, true), { f: COL.gutGlow, o: 16 }, SCALE(1.05, 955, 700));
        organ(L, 'Gut_Glow_Inner', smooth(glow, true), { f: COL.gutGlow, o: 24 }, SCALE(0.99, 955, 700));

        // large intestine: ascending (left), transverse (top), descending (right),
        // sigmoid along the bottom and rectum down the middle
        var colon = 'M907 760 C903 760 898 755 893 750 C888 745 881 738 877 730' +
            lumps([877, 730], [[873, 716], [872, 701], [873, 686], [872, 671], [873, 656], [875, 641], [882, 628], [896, 620]], 0.5) +
            lumps([896, 620], [[913, 618], [930, 619], [947, 618], [964, 619], [981, 618], [998, 619], [1015, 619], [1027, 624]], 0.4) +
            lumps([1027, 624], [[1032, 638], [1032, 654], [1033, 670], [1032, 686], [1033, 702], [1032, 718], [1028, 732], [1018, 740]], 0.5) +
            lumps([1018, 740], [[1002, 742], [986, 741]], 0.4) +
            lumps([986, 741], [[978, 752], [974, 766], [970, 780], [964, 791]], 0.45) +
            ' C961 797 954 799 951 794' +
            lumps([951, 794], [[948, 781], [946, 767], [945, 753], [945, 742]], 0.45) +
            ' L945 728 L912 728 C907 734 908 748 909 754 C909 757 908 759 907 760 Z';
        organ(L, 'Colon_Large_Intestine', colon, { f: COL.colon });

        organ(L, 'Small_Intestine', cloud([[906, 656], [921, 651], [936, 654], [951, 651], [966, 654], [981, 651], [1000, 654],
            [1002, 672], [1001, 690], [998, 706], [975, 712], [950, 716], [946, 730], [932, 738], [915, 736], [906, 724],
            [905, 706], [905, 688], [905, 671]], 0.2), { f: COL.smallInt });
        strokes(L, 'Small_Intestine_Fold', [
            [[909, 660], [911, 672], [917, 678], [922, 668]],
            [[946, 659], [956, 667], [961, 680], [957, 690]],
            [[968, 657], [977, 665], [980, 679]],
            [[986, 659], [987, 668], [994, 670]],
            [[908, 697], [925, 690], [942, 693], [958, 697], [974, 694], [996, 688]],
            [[922, 706], [935, 711], [945, 705], [952, 712], [968, 712]],
            [[908, 717], [920, 721], [934, 720]],
            [[932, 662], [928, 676], [934, 684]]
        ], { s: COL.smallIntFold, w: 2.6 });

        // sigmoid loop crosses in front of the small intestine
        organ(L, 'Colon_Sigmoid', 'M1018 748 L1016 696' + lumps([1016, 696], [[998, 707], [978, 708], [960, 709]], -0.15) +
            ' C951 709 945 716 944 726 L943 748 Z', { f: COL.colon });
        organ(L, 'Colon_Taenia_Line', smooth([[904, 750], [896, 737], [894, 702], [894, 652], [900, 637], [950, 635], [1005, 635],
            [1014, 643], [1015, 690], [1014, 716], [1007, 725], [985, 727], [967, 729], [959, 738], [958, 772]], false),
            { s: COL.colonLine, w: 2 });
    }

    // ========================================================================
    //  STAGE 4  -  LABELS
    // ========================================================================
    function findFont(names) {
        for (var j = 0; j < names.length; j++) {
            try { return app.textFonts.getByName(names[j]); } catch (e) {}
        }
        return null;   // falls back to Illustrator's default font
    }
    var FONT = findFont(['Gilroy-SemiBold', 'Montserrat-SemiBold', 'Nunito-Bold', 'Quicksand-Bold',
        'Poppins-Medium', 'ArialRoundedMTBold', 'Arial-BoldMT']);

    // white/purple box sized to its text. opt: x (left edge, or right edge if opt.right), y (top), h, pad, size, text, fill
    function boxLabel(container, prefix, str, opt) {
        var t = container.textFrames.add();
        t.contents = str;
        t.name = prefix + '_Text';
        var ca = t.textRange.characterAttributes;
        ca.size = opt.size;
        ca.fillColor = rgb(opt.text);
        if (FONT) ca.textFont = FONT;
        var w = t.width + 2 * opt.pad, left = opt.right ? opt.x - w : opt.x;
        shape(container, prefix + '_Box', rect(left, opt.y, w, opt.h), { f: opt.fill });
        t.position = [X(left + opt.pad), Y(opt.y + (opt.h - t.height) / 2)];
        t.zOrder(ZOrderMethod.BRINGTOFRONT);
        return t;
    }

    function buildLabels() {
        boxLabel(LBL.Title_Label, 'Title', 'Oxygen Therapy / Mechanical Ventilation',
            { x: 35, y: 37, h: 59, pad: 38, size: 34, text: COL.white, fill: COL.titleBox });

        var lw = { s: COL.leader, w: 2.5 };
        shape(LBL.Label_Neurological, 'Neuro_Leader', poly([[1096, 299], [1031, 312]]), lw);
        boxLabel(LBL.Label_Neurological, 'Neuro', 'Neurological Issues',
            { x: 1095, y: 261, h: 43, pad: 26, size: 26, text: COL.labelText, fill: COL.labelBox });

        shape(LBL.Label_Respiratory, 'Respiratory_Leader', poly([[1096, 592], [966, 552]]), lw);
        boxLabel(LBL.Label_Respiratory, 'Respiratory', 'Respiratory Issues',
            { x: 1095, y: 591, h: 42, pad: 26, size: 26, text: COL.labelText, fill: COL.labelBox });

        shape(LBL.Label_Gut, 'Gut_Leader', poly([[716, 629], [875, 655]]), lw);
        boxLabel(LBL.Label_Gut, 'Gut', 'Gut Issues',
            { x: 717, y: 591, h: 42, pad: 26, size: 26, text: COL.labelText, fill: COL.labelBox, right: true });
    }

    // ========================================================================
    //  BUILD
    // ========================================================================
    buildBackground(LY.BG_Wall_Grid);
    buildMonitorLeft(LY.Monitors_Left);
    buildMonitorRight(LY.Monitors_Right);
    buildIncubatorBase(LY.Incubator_Base);
    buildIncubatorGlass(LY.Incubator_Glass);
    buildPortholes(LY.Incubator_Portholes);

    buildBrain(ORG.Brain);
    buildLungs(ORG.Lungs);
    buildIntestines(ORG.Intestines);
    buildLabels();

    // still to come: baby (stage 2), tubes / wires + tapes (stage 3)

    // hidden by default (layers must be visible while drawing into them)
    LY.Organs_Overlay.visible = false;
    LBL.Label_Neurological.visible = false;
    LBL.Label_Respiratory.visible = false;
    LBL.Label_Gut.visible = false;

    try { doc.selection = null; } catch (e2) {}
    try { app.redraw(); } catch (e3) {}
    alert('NICU illustration built: stages ' + STAGES_BUILT + '.\n' +
        'Organs_Overlay and the three organ labels are hidden - turn them on in the Layers panel.' +
        (FONT ? '' : '\nLabel font not found - default font used.'));

})();
