import assert from 'node:assert/strict';
import test from 'node:test';
import { mapExternalBiomarker } from '../../backend/src/modules/external-clients/external-biomarker.domain.js';
import type { ParsedParameter, ReportAnalysisResult } from '../../backend/src/modules/reports/reports.service.js';

const analysis = { reportDate:'2026-02-01', sampleCollectionDate:'2026-02-01', qualityGate:{ extractionConfidence:0.97, confidence:0.97 } } as ReportAnalysisResult & {sampleCollectionDate:string};
const fixture = [
  ['Glycosylated Hemoglobin (HbA1c)',8.1,'%','hba1c'],['Glucose Fasting',236,'mg/dL','fasting_glucose'],['Hemoglobin',13.2,'g/dL','hemoglobin'],['Platelet Count',276,'10^3/µl','platelets'],['TLC',6.5,'10^3/µl','wbc'],['Neutrophils',64,'%','neutrophils_percent'],['Lymphocytes',22,'%','lymphocytes_percent'],['MCV',83.1,'fl','mcv'],['MCH',27.8,'pg','mch'],['MCHC',33.5,'g/dL','mchc'],['LDL Cholesterol',124.2,'mg/dL','ldl_cholesterol'],['Vitamin - B12',178,'pg/mL','vitamin_b12'],['Vitamin D 25 - Hydroxy',11.3,'ng/mL','vitamin_d'],['Thyroid Stimulating Hormone (Ultrasensitive)',2.4,'mIU/L','tsh'],['Creatinine',0.96,'mg/dL','creatinine'],
] as const;

test('deterministic redacted golden contract preserves source values, units, mappings and sample date',()=>{
  const mapped=fixture.map(([name,value,unit,id],index)=>mapExternalBiomarker({name,value,unit,referenceRange:'',category:'Blood',status:'normal',extractionConfidence:0.97} as ParsedParameter,index,analysis,{uploaded_at:'2026-10-15'},{sourcePage:13,sourceTestName:name,sourceSectionPrecedence:'DETAILED_RESULT',sourceTraceable:true}));
  assert.equal(mapped.length,15);
  for(let index=0;index<mapped.length;index+=1){assert.equal(mapped[index].numericValue,fixture[index][1]);assert.equal(mapped[index].canonicalId,fixture[index][3]);assert.equal(mapped[index].observationDate,'2026-02-01');assert.equal(mapped[index].bulkConfirmEligible,true);assert.equal(mapped[index].sourceTraceable,true);}
  assert.equal(mapped.find(item=>item.canonicalId==='mcv')?.canonicalUnit,'fL');
});

test('bulk confirmation fails closed for unmapped or sourceless rows',()=>{
  const row={name:'Unrecognised experimental marker',value:12,unit:'x',referenceRange:'',category:'Blood',status:'normal',extractionConfidence:0.97} as ParsedParameter;
  assert.equal(mapExternalBiomarker(row,0,analysis,{uploaded_at:'2026-10-15'},{sourceTraceable:true}).bulkConfirmEligible,false);
  assert.equal(mapExternalBiomarker({...row,name:'Hemoglobin'},0,analysis,{uploaded_at:'2026-10-15'},{sourceTraceable:false}).bulkConfirmEligible,false);
});
