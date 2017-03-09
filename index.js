'use strict';

var rbush = require('rbush');

module.exports = polysnap;

function polysnap(polygon) {
    var edges = [];
    var hotPixels = [];

    for (var i = 0, last; i < polygon.length; i++) {
        // link polygon points into a circular doubly linked list
        last = insertNode(makeVertex(polygon[i][0], polygon[i][1], i), last);
        updateBBox(last.prev);
        edges.push(last);

        // add each endpoint to hot pixels array
        hotPixels.push(makePixel(last.x, last.y));
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

    for (i = 0; i < hotPixels.length; i++) {
        var link = hotPixels[i].link;
        sortLinks(link);
        // var p = link;
        // var angles = [];
        // do {
        //     angles.push(Math.round(p.angle * 100) / 100);
        //     p = p.next;
        // } while (p !== link);
        // console.log(hotPixels[i], angles);
    }

    // collect the result array from the linked list
    var result = [];
    var e = last;
    do {
        result.push([e.x, e.y]);
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
                    findIntersection(edge, edge.next, q, q.next, intersections);
                }
            }
        }
        node = nodesToSearch.pop();
    }
}

// check if two edges introduce a new intersection
function isNewIntersection(s, q) {
    return s.i + 1 < q.i && s !== q.next && segmentsIntersect(s, s.next, q, q.next);
}

// check if an edge intersects a pixel
function edgeIntersectsPixel(a, b, p) {
    if ((p.x === a.x && p.y === a.y) ||
        (p.x === b.x && p.y === b.y)) return false;

    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var px = p.x - a.x;
    var py = p.y - a.y;

    if (dy !== 0 && p.x === a.x + Math.floor(0.5 + dx * (py - 0.5) / dy)) return true; // bottom x
    if (dy !== 0 && p.x === a.x + Math.floor(0.5 + dx * (py + 0.5) / dy)) return true; // top x
    if (dx !== 0 && p.y === a.y + Math.floor(0.5 + dy * (px - 0.5) / dx)) return true; // left y
    if (dx !== 0 && p.y === a.y + Math.floor(0.5 + dy * (px + 0.5) / dx)) return true; // right y

    return false;
}

// find a rounded intersection point between two edges and append to intersections array
function findIntersection(a, b, c, d, intersections) {
    var d1x = b.x - a.x;
    var d1y = b.y - a.y;
    var d2x = d.x - c.x;
    var d2y = d.y - c.y;
    var cross = d1x * d2y - d1y * d2x;
    var nom = (c.x - a.x) * d2y - (c.y - a.y) * d2x;
    var px = a.x + Math.floor(0.5 + d1x * nom / cross);
    var py = a.y + Math.floor(0.5 + d1y * nom / cross);

    if ((px === a.x && py === a.y) ||
        (px === b.x && py === b.y) ||
        (px === c.x && py === c.y) ||
        (px === d.x && py === d.y)) return;

    intersections.push(makePixel(px, py));
}

// match a hot pixel against all edges
function handleHotPixel(p, edgeTree) {
    var node = edgeTree.data;
    var nodesToSearch = [];

    while (node) {
        for (var i = 0; i < node.children.length; i++) {
            var q = node.children[i];
            var s = q.next;

            if (pointInsideBBox(p, q)) {
                if (!node.leaf) {
                    nodesToSearch.push(q);

                } else if (p.x === q.x && p.y === q.y) {
                    p.link = insertNode(makeLink(q, false), p.link);
                    p.link = insertNode(makeLink(q, true), p.link);

                } else if (edgeIntersectsPixel(q, s, p)) {
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
        return manhattanDist(e, a) - manhattanDist(e, b);
    });

    // insert hot points between edge endpoints
    for (var i = 0, last = e; i < e.hotPixels.length; i++) {
        var p = e.hotPixels[i];
        last = insertNode(makeVertex(p.x, p.y, e.i), last);
        p.link = insertNode(makeLink(last, true), p.link);
        p.link = insertNode(makeLink(last, false), p.link);
    }
}

// represents a polygon vertex and its assosiated edge
function makeVertex(x, y, i) {
    return {
        x: x,
        y: y,
        prev: null,
        next: null,
        i: i,
        minX: 0,
        minY: 0,
        maxX: 0,
        maxY: 0,
        hotPixels: null,
        incoming: null,
        outcoming: null
    };
}

// represents a hot pixel
function makePixel(x, y) {
    return {
        x: x,
        y: y,
        link: null
    };
}

// represents a half-edge that connects to a particular vertex
function makeLink(e, incoming) {
    var p = incoming ? e.prev : e.next;
    var dx = p.x - e.x;
    var dy = p.y - e.y;

    // pseudo-angle that's faster to calculate but has the same sorting properties
    var angle = 0.5 + (dy < 0 ? -1 : 1) * (1 - dx / (Math.abs(dx) + Math.abs(dy))) / 4;

    var link = {
        angle: angle,
        incoming: incoming,
        vertex: e,
        prev: null,
        next: null
    };

    if (incoming) {
        e.incoming = link;
    } else {
        e.outcoming = link;
    }

    return link;
}

// insert a new node into a circular doubly linked list
function insertNode(node, prev) {
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
    node.minX = Math.min(node.x, node.next.x);
    node.minY = Math.min(node.y, node.next.y);
    node.maxX = Math.max(node.x, node.next.x);
    node.maxY = Math.max(node.y, node.next.y);
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
    return p.x >= box.minX &&
           p.x <= box.maxX &&
           p.y >= box.minY &&
           p.y <= box.maxY;
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
    return (a.x - b.x) || (a.y - b.y);
}

// calculate signed area of a triangle
function area(p, q, r) {
    return (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
}

// Manhattan distance between two points
function manhattanDist(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

// Simon Tatham's linked list merge sort algorithm
// http://www.chiark.greenend.org.uk/~sgtatham/algorithms/listsort.html
// sorts a circular list of half-edges in a vertex by angle
function sortLinks(list) {
    var i, p, q, e, tail, numMerges, pSize, qSize, oldHead,
        inSize = 1;

    do {
        p = list;
        oldHead = list;
        list = null;
        tail = null;
        numMerges = 0;

        while (p) {
            numMerges++;
            q = p;
            pSize = 0;
            for (i = 0; i < inSize; i++) {
                pSize++;
                q = q.next === oldHead ? null : q.next;
                if (!q) break;
            }

            qSize = inSize;

            while (pSize > 0 || (qSize > 0 && q)) {

                if (pSize !== 0 && (qSize === 0 || !q || p.angle <= q.angle)) {
                    e = p;
                    p = p.next;
                    pSize--;
                    if (p === oldHead) p = null;
                } else {
                    e = q;
                    q = q.next;
                    qSize--;
                    if (q === oldHead) q = null;
                }

                if (tail) tail.next = e;
                else list = e;

                e.prev = tail;
                tail = e;
            }

            p = q;
        }

        tail.next = list;
        list.prev = tail;
        inSize *= 2;

    } while (numMerges > 1);

    return list;
}
