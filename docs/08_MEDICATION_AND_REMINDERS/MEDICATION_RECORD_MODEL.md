# Fiteatsy — Medication Record Model

## Conceptual Medication Record

A future durable medication record may include:

- medication_id;
- client_ref;
- display_name;
- strength/dose text where provided;
- dosage instructions entered by the user;
- form/route where relevant;
- start_date;
- end_date;
- active/inactive status;
- notes;
- source;
- created_at;
- updated_at;
- version.

Exact physical schema is not frozen here.

## Source

Medication source should be explicit where relevant, for example:

- USER_ENTERED;
- PRACTITIONER_CONTEXT [future, if approved];
- IMPORTED [future].

## History

Important historical medication state should not be destroyed merely because the user edits the current schedule.

## Validation

The application may validate data shape and schedule consistency.

It must not treat product validation as medical validation.

## Client Ownership

Medication records belong to the Fiteatsy Client, not merely to a device installation.
