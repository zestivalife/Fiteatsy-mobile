import assert from 'node:assert/strict';
import test from 'node:test';
import { candidateValidationEnabled } from '../../backend/src/modules/intelligence/star-orb-candidate.service.js';

test('candidate validation gate is impossible in production even when requested',()=>{
  const originalNode=process.env.NODE_ENV;const originalGate=process.env.STAR_ORB_CANDIDATE_VALIDATION_ENABLED;
  try{
    process.env.NODE_ENV='production';process.env.STAR_ORB_CANDIDATE_VALIDATION_ENABLED='true';
    assert.equal(candidateValidationEnabled(),false);
    process.env.NODE_ENV='test';assert.equal(candidateValidationEnabled(),true);
    process.env.STAR_ORB_CANDIDATE_VALIDATION_ENABLED='false';assert.equal(candidateValidationEnabled(),false);
  }finally{
    if(originalNode==null)delete process.env.NODE_ENV;else process.env.NODE_ENV=originalNode;
    if(originalGate==null)delete process.env.STAR_ORB_CANDIDATE_VALIDATION_ENABLED;else process.env.STAR_ORB_CANDIDATE_VALIDATION_ENABLED=originalGate;
  }
});
