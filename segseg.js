'use strict';

module.exports = segmentsIntersect;

function area(p, q, r) {
    return (q[1] - p[1]) * (r[0] - q[0]) - (q[0] - p[0]) * (r[1] - q[1]);
}

function segmentsIntersect(a0, a1, b0, b1) {
    var x0 = area(a0, b0, b1);
    var y0 = area(a1, b0, b1);
    if ((x0 > 0 && y0 > 0) || (x0 < 0 && y0 < 0)) return false;

    var x1 = area(b0, a0, a1);
    var y1 = area(b1, a0, a1);
    if ((x1 > 0 && y1 > 0) || (x1 < 0 && y1 < 0)) return false;

    if (x0 === 0 && y0 === 0 && x1 === 0 && y1 === 0) { // collinear
        return Math.max(b0[0], b1[0]) >= Math.min(a0[0], a1[0]) &&
               Math.max(a0[0], a1[0]) >= Math.min(b0[0], b1[0]) &&
               Math.max(b0[1], b1[1]) >= Math.min(a0[1], a1[1]) &&
               Math.max(a0[1], a1[1]) >= Math.min(b0[1], b1[1]);
    }

    return true;
}
