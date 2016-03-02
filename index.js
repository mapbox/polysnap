'use strict';

var rbush = require('rbush');

module.exports = polyclip;

function polyclip(subject) {

    var k = 0;

    console.time('link & index');
    var segTree = rbush();

    var segments = [];
    for (var i = 0, last; i < subject.length; i++) {
        if (last && equals(last.p, subject[i])) continue;
        last = insertNode(subject[i], last);
        if (i) segments.push(updateBBox(last.prev));
    }
    segments.push(updateBBox(last));

    segTree.load(segments);
    console.timeEnd('link & index');

    console.time('search intersections');
    while (segments.length) {
        var s = segments.pop();
        var result = findIntersectingEdge(segTree, s);
        if (result) {
            k++;
            handleIntersections(s, result, segTree, segments);
        }
    }
    console.timeEnd('search intersections');

    return k;
}

function findIntersectingEdge(tree, s) {
    var node = tree.data;
    var nodesToSearch = [];

    while (node) {
        for (var i = 0; i < node.children.length; i++) {
            var q = node.children[i];

            if (bboxIntersects(s, q)) {
                if (!node.leaf) nodesToSearch.push(q);
                else if (isNewIntersection(s, q)) return q;
            }
        }
        node = nodesToSearch.pop();
    }

    return null;
}

function isNewIntersection(s, q) {
    return s !== q && s !== q.next && s.next !== q &&
           s.twin !== q && s.twin !== q.next &&
           s.next.twin !== q && s.next.twin !== q.next &&
           segmentsIntersect(s.p, s.next.p, q.p, q.next.p);
}

function bboxIntersects(a, b) {
    return b.minX <= a.maxX &&
           b.minY <= a.maxY &&
           b.maxX >= a.minX &&
           b.maxY >= a.minY;
}

function insertNode(p, prev) {
    var node = {
        p: p,
        prev: null,
        next: null,
        minX: 0,
        minY: 0,
        maxX: 0,
        maxY: 0,
        twin: null
    };

    if (!prev) {
        node.prev = node;
        node.next = node;

    } else {
        node.next = prev.next;
        node.prev = prev;
        prev.next.prev = node;
        prev.next = node;
    }
    return node;
}

function updateBBox(node) {
    var p1 = node.p;
    var p2 = node.next.p;
    node.minX = Math.min(p1[0], p2[0]);
    node.minY = Math.min(p1[1], p2[1]);
    node.maxX = Math.max(p1[0], p2[0]);
    node.maxY = Math.max(p1[1], p2[1]);
    return node;
}

function handleIntersections(e1, e2, segTree, queue) {
    if (!e1 || !e2) return;

    var p1 = e1.p,
        p1b = e1.next.p,
        p2 = e2.p,
        p2b = e2.next.p,

        ex = p2[0] - p1[0],
        ey = p2[1] - p1[1],
        d1x = p1b[0] - p1[0],
        d1y = p1b[1] - p1[1],
        d2x = p2b[0] - p2[0],
        d2y = p2b[1] - p2[1],
        cross = d1x * d2y - d1y * d2x,
        sqrLen0 = d1x * d1x + d1y * d1y;

    if (cross !== 0) {
        var s = (ex * d2y - ey * d2x) / cross;
        var p = [Math.round(p1[0] + s * d1x), Math.round(p1[1] + s * d1y)];

        var sNode =
            equals(p, e1.p) ? e1 :
            equals(p, e1.next.p) ? e1.next :
            divideEdge(e1, p, segTree, queue);

        var tNode =
            equals(p, e2.p) ? e2 :
            equals(p, e2.next.p) ? e2.next :
            divideEdge(e2, p, segTree, queue);

        sNode.twin = tNode;
        tNode.twin = sNode;

        return;
    }

    // lines are collinear
    var s0 = (d1x * ex + d1y * ey) / sqrLen0,
        s1 = s0 + (d1x * d2x + d1y * d2y) / sqrLen0;

    // console.log('unhandled overlap', p1, p1b, p2, p2b, Math.min(s0, s1), Math.max(s0, s1));
}

function divideEdge(e, p, segTree, queue) {
    var e2 = insertNode(p, e);
    segTree.remove(e);
    segTree.insert(updateBBox(e));
    segTree.insert(updateBBox(e2));
    queue.push(e);
    queue.push(e2);
    return e2;
}

function equals(a, b) {
    return a[0] === b[0] && a[1] === b[1];
}

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
