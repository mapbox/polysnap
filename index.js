'use strict';

var rbush = require('rbush');

module.exports = polyclip;

function polyclip(subject) {
    console.time('index edges');
    for (var i = 0, last; i < subject.length; i++) {
        last = insertNode(subject[i], i, last);
    }

    var edgeTree = rbush();
    var edges = [];
    var hotPixels = [];

    var e = last;
    do {
        edges.push(updateBBox(e));
        hotPixels.push(e.p);
        e = e.next;
    } while (e !== last);

    edgeTree.load(edges);
    console.timeEnd('index edges');

    console.time('search intersections');
    for (var i = 0; i < edges.length; i++) {
        searchIntersections(edgeTree, edges[i], hotPixels);
    }
    console.timeEnd('search intersections');

    console.time('match hot pixels');
    for (var i = 0; i < hotPixels.length; i++) {
        handleHotPixel(hotPixels[i], edgeTree);
    }
    console.timeEnd('match hot pixels');
}

function compareHotPixels(a, b) {
    return (a[0] - b[0]) || (a[1] - b[1]);
}

var k = 0;

function handleHotPixel(p, tree) {
    var node = tree.data;
    var nodesToSearch = [];

    while (node) {
        for (var i = 0; i < node.children.length; i++) {
            var q = node.children[i];

            if (pointInsideBBox(p, q)) {
                if (!node.leaf) {
                    nodesToSearch.push(q);

                } else if (!equals(p, q.p) && !equals(p, q.next.p)) {
                    matchHotPixelAgainstEdge(p, q);
                }
            }
        }
        node = nodesToSearch.pop();
    }
}

function matchHotPixelAgainstEdge(p, e) {

}

function pointInsideBBox(p, box) {
    return p[0] >= box.minX &&
           p[0] <= box.maxX &&
           p[1] >= box.minY &&
           p[1] <= box.maxY;
}

function searchIntersections(tree, edge, intersections) {
    var node = tree.data;
    var nodesToSearch = [];

    while (node) {
        for (var i = 0; i < node.children.length; i++) {
            var q = node.children[i];

            if (bboxIntersects(edge, q)) {
                if (!node.leaf) {
                    nodesToSearch.push(q);

                } else if (isNewIntersection(edge, q)) {
                    handleIntersection(edge, q, intersections);
                }
            }
        }
        node = nodesToSearch.pop();
    }
}

function isNewIntersection(s, q) {
    return s !== q.next && s.next !== q && s.i < q.i &&
           segmentsIntersect(s.p, s.next.p, q.p, q.next.p);
}

function bboxIntersects(a, b) {
    return b.minX <= a.maxX &&
           b.minY <= a.maxY &&
           b.maxX >= a.minX &&
           b.maxY >= a.minY;
}

function insertNode(p, i, prev) {
    var node = {
        p: p,
        prev: null,
        next: null,
        i: i,
        minX: 0,
        minY: 0,
        maxX: 0,
        maxY: 0
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

var k = 0;

function handleIntersection(e1, e2, hotPixels) {
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

    if (cross === 0) return;

    var s = (ex * d2y - ey * d2x) / cross;
    var x = Math.round(p1[0] + s * d1x);
    var y = Math.round(p1[1] + s * d1y);

    addIntersection(x, y, e1, hotPixels);
    addIntersection(x, y, e2, hotPixels);
}

function addIntersection(x, y, e, hotPixels) {
    var a = e.p;
    var b = e.next.p;

    if (x === a[0] && y === a[1]) return;
    if (x === b[0] && y === b[1]) return;

    hotPixels.push([x, y]);
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

    if (x0 === 0 && y0 === 0 && x1 === 0 && y1 === 0) return false; // collinear

    return true;
}
