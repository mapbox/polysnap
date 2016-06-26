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
        searchIntersections(edges[i], edgeTree, hotPixels);
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

// search for intersections between a given edge and all other edges
function searchIntersections(edge, edgeTree, intersections) {
    var node = edgeTree.data;
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

// check if two edges introduce a new intersection
function isNewIntersection(s, q) {
    return s.i + 1 < q.i && s !== q.next && segmentsIntersect(s.p, s.next.p, q.p, q.next.p);
}

// check if a hot pixel intersects an edge
function hotPixelIntersectsEdge(p, e) {
    var a = e.p;
    var b = e.next.p;

    if (equals(p, a) || equals(p, b)) return false;

    var dx = b[0] - a[0];
    var dy = b[1] - a[1];
    var px = p[0] - a[0];
    var py = p[1] - a[1];

    if (dy !== 0 && p[0] === a[0] + Math.floor(0.5 + dx * (py - 0.5) / dy)) return true; // bottom x
    if (dy !== 0 && p[0] === a[0] + Math.floor(0.5 + dx * (py + 0.5) / dy)) return true; // top x
    if (dx !== 0 && p[1] === a[1] + Math.floor(0.5 + dy * (px - 0.5) / dx)) return true; // left y
    if (dx !== 0 && p[1] === a[1] + Math.floor(0.5 + dy * (px + 0.5) / dx)) return true; // right y

    return false;
}

// find a rounded intersection point between two edges and append to intersections array
function handleIntersection(e1, e2, intersections) {
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
    var px = a[0] + Math.floor(0.5 + d1x * nom / cross);
    var py = a[1] + Math.floor(0.5 + d1y * nom / cross);
    var p = [px, py];

    if (equals(p, a) || equals(p, b) || equals(p, c) || equals(p, d)) return;

    intersections.push(p);
}

// match a hot pixel against all edges
function handleHotPixel(p, edgeTree) {
    var node = edgeTree.data;
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

// connect an edge through its hot points
function snapRoundEdge(e) {
    if (!e.hotPixels) return;

    // sort hot pixels by pixel distance from the first edge point
    e.hotPixels.sort(function (a, b) {
        return manhattanDist(e.p, a) - manhattanDist(e.p, b);
    });

    // insert hot points between edge endpoints
    for (var i = 0, last = e; i < e.hotPixels.length; i++) {
        last = insertNode(e.hotPixels[i], e.i, last);
    }
}

// insert a point into a circular doubly linked list
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

// update edge bounding box
function updateBBox(node) {
    var p1 = node.p;
    var p2 = node.next.p;
    node.minX = Math.min(p1[0], p2[0]);
    node.minY = Math.min(p1[1], p2[1]);
    node.maxX = Math.max(p1[0], p2[0]);
    node.maxY = Math.max(p1[1], p2[1]);
    return node;
}

// check if two segments intersect (ignoring collinear overlapping case)
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


// check if two bboxes intersect
function bboxIntersects(a, b) {
    return b.minX <= a.maxX &&
           b.minY <= a.maxY &&
           b.maxX >= a.minX &&
           b.maxY >= a.minY;
}

// check if a point is inside a bbox
function pointInsideBBox(p, box) {
    return p[0] >= box.minX &&
           p[0] <= box.maxX &&
           p[1] >= box.minY &&
           p[1] <= box.maxY;
}

// filter out duplicate points
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

// lexicographic point comparison
function comparePixels(a, b) {
    return (a[0] - b[0]) || (a[1] - b[1]);
}

// calculate signed area of a triangle
function area(p, q, r) {
    return (q[1] - p[1]) * (r[0] - q[0]) - (q[0] - p[0]) * (r[1] - q[1]);
}

// check if two points are equal
function equals(a, b) {
    return a[0] === b[0] && a[1] === b[1];
}

// Manhattan distance between two points
function manhattanDist(a, b) {
    return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
}
