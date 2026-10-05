import {test} from 'node:test';
import assert from 'node:assert/strict';
import {lineAnchor,polygonAnchor} from '../src/record-label-geometry.js';
const box=[0,0,100,100];
test('선은 화면에 보이는 길이의 중간에 배치한다',()=>{
 assert.deepEqual(lineAnchor([[[-100,50],[300,50]]],box),[50,50]);
 assert.deepEqual(lineAnchor([[[10,10],[90,10],[90,50]]],box),[70,10]);
 assert.equal(lineAnchor([[[-20,-20],[-10,-10]]],box),null);
});
test('분리된 선은 가장 긴 보이는 구간을 사용한다',()=>{
 assert.deepEqual(lineAnchor([[[0,10],[10,10]],[[0,50],[100,50]]],box),[50,50]);
});
test('면은 화면과 교차한 부분 내부에 놓고 구멍을 피한다',()=>{
 assert.deepEqual(polygonAnchor([[[[-50,-50],[150,-50],[150,150],[-50,150],[-50,-50]]]],box),[50,50]);
 const anchor=polygonAnchor([[[[0,0],[100,0],[100,100],[0,100],[0,0]],[[30,30],[70,30],[70,70],[30,70],[30,30]]]],box);
 assert.ok(anchor && (anchor[0]<30 || anchor[0]>70 || anchor[1]<30 || anchor[1]>70));
 assert.equal(polygonAnchor([[[[200,200],[300,200],[300,300],[200,300],[200,200]]]],box),null);
});
