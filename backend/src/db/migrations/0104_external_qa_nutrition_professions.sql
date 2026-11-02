begin;

alter table external_qa_practice_provisioning
  drop constraint if exists external_qa_practice_provisioning_profession_code_check;

alter table external_qa_practice_provisioning
  add constraint external_qa_practice_provisioning_profession_code_check
  check (profession_code in (
    'DIETITIAN','NUTRITIONIST','CLINICAL_NUTRITIONIST','SPORTS_NUTRITIONIST',
    'DIABETES_EDUCATOR','PSYCHOLOGIST','WELLNESS_CONSULTANT','HEALTH_COACH',
    'BEHAVIOURAL_THERAPIST','OCCUPATIONAL_THERAPIST','PHYSIOTHERAPIST','MENTAL_WELLNESS_THERAPIST'
  ));

comment on constraint external_qa_practice_provisioning_profession_code_check
  on external_qa_practice_provisioning is
  'Allow-listed governed QA professions, including nutrition authoring fixtures.';

commit;
