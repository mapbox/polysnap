'use strict';

var rbush = require('rbush');

module.exports = polyclip;

function polyclip(polygon) {
    var edges = [];
    var hotPixels = [];

    for (var i = 0, last; i < polygon.length; i++) {
        // link polygon points into a circular doubly linked list
        last = insertNode(polygon[i], i, last);
        updateBBox(last.prev);
        edges.push(last);

        // add each endpoint to hot pixels array
        hotPixels.push(last.p);
    }
    updateBBox(last);

    // index all edges by bbox with an R-tree
    var edgeTree = rbush().load(edges);

    // search for intersections between edges and store them in hot pixels array
    for (i = 0; i < edges.length; i++) {
        searchIntersections(edgeTree, edges[i], hotPixels);
    }

    // filter out duplicate hot pixels
    hotPixels = uniquePixels(hotPixels);

    // match every hot pixel against all edges, finding intersections
    for (i = 0; i < hotPixels.length; i++) {
        handleHotPixel(hotPixels[i], edgeTree);
    }

    // subdivide each edge by its matching hot pixels
    for (i = 0; i < edges.length; i++) {
        snapRoundEdge(edges[i]);
    }

    // collect the result array from the linked list
    var result = [];
    var e = last;
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

    var dx = b[0] - a[0];
    var dy = b[1] - a[1];
    var px = p[0] - a[0];
    var py = p[1] - a[1];

    if (dy !== 0 && p[0] === a[0] + divRound(dx * (2 * py - 1), 2 * dy)) return true; // bottom x
    if (dy !== 0 && p[0] === a[0] + divRound(dx * (2 * py + 1), 2 * dy)) return true; // top x
    if (dx !== 0 && p[1] === a[1] + divRound(dy * (2 * px - 1), 2 * dx)) return true; // left y
    if (dx !== 0 && p[1] === a[1] + divRound(dy * (2 * px + 1), 2 * dx)) return true; // right y

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
    return s.i + 1 < q.i && s !== q.next && segmentsIntersect(s.p, s.next.p, q.p, q.next.p);
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
    var px = a[0] + divRound(d1x * nom, cross);
    var py = a[1] + divRound(d1y * nom, cross);
    var p = [px, py];

    if (equals(p, a) || equals(p, b) || equals(p, c) || equals(p, d)) return;

    hotPixels.push(p);
}

function divRound(n, d) {
    return divFloor(2 * n + d, 2 * d);
}

function divFloor(n, d) {
    if (Math.abs(n) > Number.MAX_SAFE_INTEGER) {
        throw new Error('Coordinates too big');
    }
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
