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
    for (i = 0; i < edges.length; i++) {
        searchIntersections(edgeTree, edges[i], hotPixels);
    }
    console.timeEnd('search intersections');

    console.time('filter unique hot pixels');
    hotPixels = uniquePixels(hotPixels);
    console.timeEnd('filter unique hot pixels');

    console.time('match hot pixels');
    for (i = 0; i < hotPixels.length; i++) {
        handleHotPixel(hotPixels[i], edgeTree);
    }
    console.timeEnd('match hot pixels');

    console.time('connect edges through hot pixels');
    for (i = 0; i < edges.length; i++) {
        snapRoundEdge(edges[i]);
    }
    console.timeEnd('connect edges through hot pixels');

    var result = [];
    do {
        result.push(e.p);
        e = e.next;
    } while (e !== last);

    return result;
}

function manhattanDist(a, b) {
    return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
}

function snapRoundEdge(e) {
    if (!e.hotPixels) return;

    e.hotPixels.sort(function (a, b) {
        return manhattanDist(e.p, a) - manhattanDist(e.p, b);
    });

    var last = e;
    for (var i = 0; i < e.hotPixels.length; i++) {
        last = insertNode(e.hotPixels[i], e.i, last);
    }
}

function uniquePixels(arr) {
    arr.sort(comparePixels);
    var result = [];
    for (var i = 0; i < arr.length; i++) {
        if (i === 0 || comparePixels(arr[i], arr[i - 1]) !== 0) {
            result.push(arr[i]);
        }
    }
    return result;
}

function comparePixels(a, b) {
    return (a[0] - b[0]) || (a[1] - b[1]);
}

function handleHotPixel(p, tree) {
    var node = tree.data;
    var nodesToSearch = [];

    while (node) {
        for (var i = 0; i < node.children.length; i++) {
            var q = node.children[i];

            if (pointInsideBBox(p, q)) {
                if (!node.leaf) {
                    nodesToSearch.push(q);

                } else if (hotPixelIntersectsEdge(p, q)) {
                    q.hotPixels = q.hotPixels || [];
                    q.hotPixels.push(p);
                }
            }
        }
        node = nodesToSearch.pop();
    }
}

function hotPixelIntersectsEdge(p, e) {
    var a = e.p;
    var b = e.next.p;

    if (equals(p, a) || equals(p, b)) return false;

    var minX = p[0] - 0.5;
    var minY = p[1] - 0.5;
    var maxX = p[0] + 0.5;
    var maxY = p[1] + 0.5;

    var tx = a[0] + (b[0] - a[0]) * (maxY - a[1]) / (b[1] - a[1]); // top x
    if (tx >= minX && tx < maxX) return true;

    var bx = a[0] + (b[0] - a[0]) * (minY - a[1]) / (b[1] - a[1]); // bottom x
    if (bx >= minX && bx < maxX) return true;

    var ly = a[1] + (b[1] - a[1]) * (minX - a[0]) / (b[0] - a[0]); // left y
    if (ly >= minY && ly < maxY) return true;

    var ry = a[1] + (b[1] - a[1]) * (maxX - a[0]) / (b[0] - a[0]); // right y
    if (ry >= minY && ry < maxY) return true;

    return false;
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
    return s !== q.next && s.i + 1 < q.i &&
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
        maxY: 0,
        hotPixels: null
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

function handleIntersection(e1, e2, hotPixels) {
    var a = e1.p;
    var b = e1.next.p;
    var c = e2.p;
    var d = e2.next.p;
    var d1x = b[0] - a[0];
    var d1y = b[1] - a[1];
    var d2x = d[0] - c[0];
    var d2y = d[1] - c[1];
    var cross = d1x * d2y - d1y * d2x;
    var nom = (c[0] - a[0]) * d2y - (c[1] - a[1]) * d2x;
    var px = a[0] + divFloor(2 * d1x * nom + cross, 2 * cross);
    var py = a[1] + divFloor(2 * d1y * nom + cross, 2 * cross);
    var p = [px, py];

    if (equals(p, a) || equals(p, b) || equals(p, c) || equals(p, d)) return;

    hotPixels.push(p);
}

function divFloor(n, d) {
    var r = n % d;
    var v = (n - r) / d;
    if ((n > 0) ^ (d > 0) && r !== 0) v--;
    return v;
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
