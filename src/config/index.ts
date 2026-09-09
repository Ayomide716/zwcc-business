/**
 * Barrel for the configuration layer.
 *
 * Everything the client is likely to change lives behind this import. If a
 * screen needs a business rule, it comes from here or from the workflow engine
 * — never from a literal typed into a component.
 */
export * from './workflow.config';
export * from './permissions.config';
export * from './documents.config';
export * from './form.config';
export * from './monitoring.config';
export * from './registration-code.config';
export * from './program.config';
export * from './notifications.config';
export * from './agreement.config';
export * from './rejection-reasons.config';
