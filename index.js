'use strict';

var rbush = require('rbush');
var segseg = require('./segseg');

module.exports = polyclip;

function polyclip(subject) {

    console.log(subject.length + ' points');

    var k = 0;

    console.time('link & index');
    var segTree = rbush();

    var segments = [];
    for (var i = 0, last; i < subject.length; i++) {
        last = insertNode(subject[i], i, last);
        if (i) segments.push(updateBBox(last.prev));
    }
    segments.push(updateBBox(last));

    segTree.load(segments);
    console.timeEnd('link & index');

    console.time('search intersections');
    for (i = 0; i < segments.length; i++) {
        var s = segments[i];
        var result = findIntersectingEdges(segTree, s);
        k += result.length;
    }
    console.timeEnd('search intersections');

    console.log(k + ' intersections');
}

function findIntersectingEdges(tree, s) {
    var node = tree.data;
    var result = [];
    var nodesToSearch = [];

    while (node) {
        for (var i = 0; i < node.children.length; i++) {
            var q = node.children[i];

            if (bboxIntersects(s, q)) {
                if (!node.leaf) nodesToSearch.push(q);
                else if (q.i > s.i + 1 && segseg(s.p, s.next.p, q.p, q.next.p)) result.push(q);
            }
        }
        node = nodesToSearch.pop();
    }

    return result;
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
        i: i,
        prev: null,
        next: null,
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
