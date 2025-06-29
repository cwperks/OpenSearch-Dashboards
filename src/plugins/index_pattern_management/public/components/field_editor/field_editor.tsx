/*
 * SPDX-License-Identifier: Apache-2.0
 *
 * The OpenSearch Contributors require contributions made to
 * this file be licensed under the Apache-2.0 license or a
 * compatible open source license.
 *
 * Any modifications Copyright OpenSearch Contributors. See
 * GitHub history for details.
 */

/*
 * Licensed to Elasticsearch B.V. under one or more contributor
 * license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright
 * ownership. Elasticsearch B.V. licenses this file to you under
 * the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import React, { PureComponent, Fragment } from 'react';
import { intersection, union, get } from 'lodash';

import {
  EuiBasicTable,
  EuiSmallButton,
  EuiSmallButtonEmpty,
  EuiCallOut,
  EuiCode,
  EuiCodeEditor,
  EuiConfirmModal,
  EuiCompressedFieldNumber,
  EuiCompressedFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiForm,
  EuiCompressedFormRow,
  EuiIcon,
  EuiLink,
  EuiCompressedSelect,
  EuiSpacer,
  EuiText,
  EUI_MODAL_CONFIRM_BUTTON,
} from '@elastic/eui';

import { i18n } from '@osd/i18n';
import { FormattedMessage } from '@osd/i18n/react';
import {
  getEnabledScriptingLanguages,
  getDeprecatedScriptingLanguages,
  getSupportedScriptingLanguages,
} from '../../scripting_languages';
import {
  IndexPatternField,
  FieldFormatInstanceType,
  IndexPattern,
  IFieldType,
  OSD_FIELD_TYPES,
  OPENSEARCH_FIELD_TYPES,
  DataPublicPluginStart,
} from '../../../../../plugins/data/public';
import { context as contextType } from '../../../../opensearch_dashboards_react/public';
import {
  ScriptingDisabledCallOut,
  ScriptingWarningCallOut,
} from './components/scripting_call_outs';

import { ScriptingHelpFlyout } from './components/scripting_help';
import { FieldFormatEditor } from './components/field_format_editor';
import { IndexPatternManagmentContextValue } from '../../types';

import { FIELD_TYPES_BY_LANG, DEFAULT_FIELD_TYPES } from './constants';
import { executeScript, isScriptValid } from './lib';

// This loads Ace editor's "groovy" mode, used below to highlight the script.
import 'brace/mode/groovy';

const getFieldTypeFormatsList = (
  field: IndexPatternField['spec'],
  defaultFieldFormat: FieldFormatInstanceType,
  fieldFormats: DataPublicPluginStart['fieldFormats']
) => {
  const formatsByType = fieldFormats
    .getByFieldType(field.type as OSD_FIELD_TYPES)
    .map(({ id, title }) => ({
      id,
      title,
    }));

  return [
    {
      id: '',
      defaultFieldFormat,
      title: i18n.translate('indexPatternManagement.defaultFormatDropDown', {
        defaultMessage: '- Default -',
      }),
    },
    ...formatsByType,
  ];
};

interface FieldTypeFormat {
  id: string;
  title: string;
}

interface InitialFieldTypeFormat extends FieldTypeFormat {
  defaultFieldFormat: FieldFormatInstanceType;
}

export interface FieldEditorState {
  isReady: boolean;
  isCreating: boolean;
  isDeprecatedLang: boolean;
  scriptingLangs: string[];
  fieldTypes: string[];
  fieldTypeFormats: FieldTypeFormat[];
  existingFieldNames: string[];
  fieldFormatId?: string;
  fieldFormatParams: { [key: string]: unknown };
  showScriptingHelp: boolean;
  showDeleteModal: boolean;
  hasFormatError: boolean;
  hasScriptError: boolean;
  isSaving: boolean;
  errors?: string[];
  format: any;
  spec: IndexPatternField['spec'];
}

export interface FieldEdiorProps {
  indexPattern: IndexPattern;
  spec: IndexPatternField['spec'];
  services: {
    redirectAway: () => void;
    saveIndexPattern: DataPublicPluginStart['indexPatterns']['updateSavedObject'];
  };
}

export class FieldEditor extends PureComponent<FieldEdiorProps, FieldEditorState> {
  static contextType = contextType;

  // @ts-expect-error TS2612 TODO(ts-error): fixme
  public readonly context!: IndexPatternManagmentContextValue;

  supportedLangs: string[] = [];
  deprecatedLangs: string[] = [];
  constructor(props: FieldEdiorProps, context: IndexPatternManagmentContextValue) {
    super(props, context);

    const { spec, indexPattern } = props;

    this.state = {
      isReady: false,
      isCreating: false,
      isDeprecatedLang: false,
      scriptingLangs: [],
      fieldTypes: [],
      fieldTypeFormats: [],
      existingFieldNames: indexPattern.fields.getAll().map((f: IFieldType) => f.name),
      fieldFormatId: undefined,
      fieldFormatParams: {},
      showScriptingHelp: false,
      showDeleteModal: false,
      hasFormatError: false,
      hasScriptError: false,
      isSaving: false,
      format: props.indexPattern.getFormatterForField(spec),
      spec: { ...spec },
    };
    this.supportedLangs = getSupportedScriptingLanguages();
    this.deprecatedLangs = getDeprecatedScriptingLanguages();
    this.init(context);
  }

  async init(context: IndexPatternManagmentContextValue) {
    const { http, notifications, data } = context.services;
    const { format, spec } = this.state;
    const { indexPattern } = this.props;

    const enabledLangs = await getEnabledScriptingLanguages(http, notifications.toasts);
    const scriptingLangs = intersection(
      enabledLangs,
      union(this.supportedLangs, this.deprecatedLangs)
    );

    spec.lang = spec.lang && scriptingLangs.includes(spec.lang) ? spec.lang : undefined;
    if (spec.scripted && !spec.lang) {
      spec.lang = scriptingLangs[0];
    }

    const fieldTypes = get(FIELD_TYPES_BY_LANG, spec.lang || '', DEFAULT_FIELD_TYPES);
    spec.type = fieldTypes.includes(spec.type) ? spec.type : fieldTypes[0];

    const DefaultFieldFormat = data.fieldFormats.getDefaultType(
      spec.type as OSD_FIELD_TYPES,
      spec.esTypes as OPENSEARCH_FIELD_TYPES[]
    );

    this.setState({
      isReady: true,
      isCreating: !indexPattern.fields.getByName(spec.name),
      isDeprecatedLang: this.deprecatedLangs.includes(spec.lang || ''),
      errors: [],
      scriptingLangs,
      fieldTypes,
      fieldTypeFormats: getFieldTypeFormatsList(
        spec,
        DefaultFieldFormat as FieldFormatInstanceType,
        data.fieldFormats
      ),
      fieldFormatId: get(indexPattern, ['fieldFormatMap', spec.name, 'type', 'id']),
      fieldFormatParams: format.params(),
    });
  }

  onFieldChange = (fieldName: string, value: string | number) => {
    const { spec } = this.state;
    (spec as any)[fieldName] = value;
    this.forceUpdate();
  };

  onTypeChange = (type: OSD_FIELD_TYPES) => {
    const { uiSettings, data } = this.context.services;
    const { spec, format } = this.state;
    const DefaultFieldFormat = data.fieldFormats.getDefaultType(type) as FieldFormatInstanceType;

    spec.type = type;

    spec.format = new DefaultFieldFormat(null, (key) => uiSettings.get(key));

    this.setState({
      fieldTypeFormats: getFieldTypeFormatsList(spec, DefaultFieldFormat, data.fieldFormats),
      fieldFormatId: DefaultFieldFormat.id,
      fieldFormatParams: format.params(),
    });
  };

  onLangChange = (lang: string) => {
    const { spec } = this.state;
    const fieldTypes = get(FIELD_TYPES_BY_LANG, lang, DEFAULT_FIELD_TYPES);
    spec.lang = lang;
    spec.type = fieldTypes.includes(spec.type) ? spec.type : fieldTypes[0];

    this.setState({
      fieldTypes,
    });
  };

  onFormatChange = (formatId: string, params?: any) => {
    const { spec, fieldTypeFormats } = this.state;
    const { uiSettings, data } = this.context.services;

    const FieldFormat = data.fieldFormats.getType(
      formatId || (fieldTypeFormats[0] as InitialFieldTypeFormat).defaultFieldFormat.id
    ) as FieldFormatInstanceType;

    const newFormat = new FieldFormat(params, (key) => uiSettings.get(key));
    spec.format = newFormat;

    this.setState({
      fieldFormatId: FieldFormat.id,
      fieldFormatParams: newFormat.params(),
      format: newFormat,
    });
  };

  onFormatParamsChange = (newParams: { fieldType: string; [key: string]: any }) => {
    const { fieldFormatId } = this.state;
    this.onFormatChange(fieldFormatId as string, newParams);
  };

  onFormatParamsError = (error?: string) => {
    this.setState({
      hasFormatError: !!error,
    });
  };

  isDuplicateName() {
    const { isCreating, spec, existingFieldNames } = this.state;
    return isCreating && existingFieldNames.includes(spec.name);
  }

  renderName() {
    const { isCreating, spec } = this.state;
    const isInvalid = !spec.name || !spec.name.trim();

    return isCreating ? (
      <EuiCompressedFormRow
        label={i18n.translate('indexPatternManagement.nameLabel', { defaultMessage: 'Name' })}
        helpText={
          this.isDuplicateName() ? (
            <span>
              <EuiIcon type="alert" color="warning" size="s" />
              &nbsp;
              <FormattedMessage
                id="indexPatternManagement.mappingConflictLabel.mappingConflictDetail"
                defaultMessage="{mappingConflict} You already have a field with the name {fieldName}. Naming your scripted field with
              the same name means you won't be able to query both fields at the same time."
                values={{
                  mappingConflict: (
                    <strong>
                      <FormattedMessage
                        id="indexPatternManagement.mappingConflictLabel.mappingConflictLabel"
                        defaultMessage="Mapping Conflict:"
                      />
                    </strong>
                  ),
                  fieldName: <EuiCode>{spec.name}</EuiCode>,
                }}
              />
            </span>
          ) : null
        }
        isInvalid={isInvalid}
        error={
          isInvalid
            ? i18n.translate('indexPatternManagement.nameErrorMessage', {
                defaultMessage: 'Name is required',
              })
            : null
        }
      >
        <EuiCompressedFieldText
          value={spec.name || ''}
          placeholder={i18n.translate('indexPatternManagement.namePlaceholder', {
            defaultMessage: 'New scripted field',
          })}
          data-test-subj="editorFieldName"
          onChange={(e) => {
            this.onFieldChange('name', e.target.value);
          }}
          isInvalid={isInvalid}
        />
      </EuiCompressedFormRow>
    ) : null;
  }

  renderLanguage() {
    const { spec, scriptingLangs, isDeprecatedLang } = this.state;

    return spec.scripted ? (
      <EuiCompressedFormRow
        label={i18n.translate('indexPatternManagement.languageLabel', {
          defaultMessage: 'Language',
        })}
        helpText={
          isDeprecatedLang ? (
            <span>
              <EuiIcon type="alert" color="warning" size="s" />
              &nbsp;
              <strong>
                <FormattedMessage
                  id="indexPatternManagement.warningHeader"
                  defaultMessage="Deprecation Warning:"
                />
              </strong>
              &nbsp;
              <FormattedMessage
                id="indexPatternManagement.warningLabel.warningDetail"
                defaultMessage="{language} is deprecated and support will be removed in the next major version of OpenSearch Dashboards and OpenSearch.
              We recommend using {painlessLink} for new scripted fields."
                values={{
                  language: <EuiCode>{spec.lang}</EuiCode>,
                  painlessLink: (
                    <EuiLink
                      target="_blank"
                      href={
                        this.context.services.docLinks.links.noDocumentation.scriptedFields.painless
                      }
                    >
                      <FormattedMessage
                        id="indexPatternManagement.warningLabel.painlessLinkLabel"
                        defaultMessage="Painless"
                      />
                    </EuiLink>
                  ),
                }}
              />
            </span>
          ) : null
        }
      >
        <EuiCompressedSelect
          value={spec.lang}
          options={scriptingLangs.map((lang) => {
            return { value: lang, text: lang };
          })}
          data-test-subj="editorFieldLang"
          onChange={(e) => {
            this.onLangChange(e.target.value);
          }}
        />
      </EuiCompressedFormRow>
    ) : null;
  }

  renderType() {
    const { spec, fieldTypes } = this.state;

    return (
      <EuiCompressedFormRow
        label={i18n.translate('indexPatternManagement.typeLabel', { defaultMessage: 'Type' })}
      >
        <EuiCompressedSelect
          value={spec.type}
          disabled={!spec.scripted}
          options={fieldTypes.map((type) => {
            return { value: type, text: type };
          })}
          data-test-subj="editorFieldType"
          onChange={(e) => {
            this.onTypeChange(e.target.value as OSD_FIELD_TYPES);
          }}
        />
      </EuiCompressedFormRow>
    );
  }

  /**
   * renders a warning and a table of conflicting indices
   * in case there are indices with different types
   */
  renderTypeConflict() {
    const { spec } = this.state;
    if (!spec.conflictDescriptions || typeof spec.conflictDescriptions !== 'object') {
      return null;
    }

    const columns = [
      {
        field: 'type',
        name: i18n.translate('indexPatternManagement.typeLabel', { defaultMessage: 'Type' }),
        width: '100px',
      },
      {
        field: 'indices',
        name: i18n.translate('indexPatternManagement.indexNameLabel', {
          defaultMessage: 'Index names',
        }),
      },
    ];

    const items = Object.entries(spec.conflictDescriptions).map(([type, indices]) => ({
      type,
      indices: Array.isArray(indices) ? indices.join(', ') : 'Index names unavailable',
    }));

    return (
      <div>
        <EuiSpacer size="m" />
        <EuiCallOut
          color="warning"
          iconType="alert"
          title={
            <FormattedMessage
              id="indexPatternManagement.fieldTypeConflict"
              defaultMessage="Field type conflict"
            />
          }
          size="s"
        >
          <FormattedMessage
            id="indexPatternManagement.multiTypeLabelDesc"
            defaultMessage="The type of this field changes across indices. It is unavailable for many analysis functions.
          The indices per type are as follows:"
          />
        </EuiCallOut>
        <EuiSpacer size="m" />
        <EuiBasicTable items={items} columns={columns} />
        <EuiSpacer size="m" />
      </div>
    );
  }

  renderFormat() {
    const { spec, fieldTypeFormats, fieldFormatId, fieldFormatParams, format } = this.state;
    const { indexPatternManagementStart } = this.context.services;
    const defaultFormat = (fieldTypeFormats[0] as InitialFieldTypeFormat).defaultFieldFormat.title;

    const label = defaultFormat ? (
      <FormattedMessage
        id="indexPatternManagement.defaultFormatHeader"
        defaultMessage="Format (Default: {defaultFormat})"
        values={{
          defaultFormat: <EuiCode>{defaultFormat}</EuiCode>,
        }}
      />
    ) : (
      <FormattedMessage id="indexPatternManagement.formatHeader" defaultMessage="Format" />
    );

    return (
      <Fragment>
        <EuiCompressedFormRow
          label={label}
          helpText={
            <FormattedMessage
              id="indexPatternManagement.formatLabel"
              defaultMessage="Formatting allows you to control the way that specific values are displayed. It can also cause values to be
              completely changed and prevent highlighting in Discover from working."
            />
          }
        >
          <EuiCompressedSelect
            value={fieldFormatId}
            options={fieldTypeFormats.map((fmt) => {
              return { value: fmt.id || '', text: fmt.title };
            })}
            data-test-subj="editorSelectedFormatId"
            onChange={(e) => {
              this.onFormatChange(e.target.value);
            }}
          />
        </EuiCompressedFormRow>
        {fieldFormatId ? (
          <FieldFormatEditor
            fieldType={spec.type}
            fieldFormat={format}
            fieldFormatId={fieldFormatId}
            fieldFormatParams={fieldFormatParams}
            fieldFormatEditors={indexPatternManagementStart.fieldFormatEditors}
            onChange={this.onFormatParamsChange}
            onError={this.onFormatParamsError}
          />
        ) : null}
      </Fragment>
    );
  }

  renderPopularity() {
    const { spec } = this.state;

    return (
      <EuiCompressedFormRow
        label={i18n.translate('indexPatternManagement.popularityLabel', {
          defaultMessage: 'Popularity',
          description:
            '"Popularity" refers to OpenSearch Dashboards\'s measurement how popular a field is (i.e. how commonly it is used).',
        })}
      >
        <EuiCompressedFieldNumber
          value={spec.count}
          data-test-subj="editorFieldCount"
          onChange={(e) => {
            this.onFieldChange('count', e.target.value ? Number(e.target.value) : '');
          }}
        />
      </EuiCompressedFormRow>
    );
  }

  onScriptChange = (value: string) => {
    this.setState({
      hasScriptError: false,
    });
    this.onFieldChange('script', value);
  };

  renderScript() {
    const { spec, hasScriptError } = this.state;
    const isInvalid = !spec.script || !spec.script.trim() || hasScriptError;
    const errorMsg = hasScriptError ? (
      <span data-test-subj="invalidScriptError">
        <FormattedMessage
          id="indexPatternManagement.scriptInvalidErrorMessage"
          defaultMessage="Script is invalid. View script preview for details"
        />
      </span>
    ) : (
      <FormattedMessage
        id="indexPatternManagement.scriptRequiredErrorMessage"
        defaultMessage="Script is required"
      />
    );

    return spec.scripted ? (
      <Fragment>
        <EuiCompressedFormRow
          fullWidth
          label={i18n.translate('indexPatternManagement.scriptLabel', { defaultMessage: 'Script' })}
          isInvalid={isInvalid}
          error={isInvalid ? errorMsg : null}
        >
          <EuiCodeEditor
            value={spec.script}
            data-test-subj="editorFieldScript"
            onChange={this.onScriptChange}
            mode="groovy"
            width="100%"
            height="300px"
          />
        </EuiCompressedFormRow>

        <EuiCompressedFormRow>
          <Fragment>
            <EuiText size="s">
              <FormattedMessage
                id="indexPatternManagement.script.accessWithLabel"
                defaultMessage="Access fields with {code}."
                values={{ code: <code>{`doc['some_field'].value`}</code> }}
              />
            </EuiText>
            <br />
            <EuiText size="s">
              <EuiLink onClick={this.showScriptingHelp} data-test-subj="scriptedFieldsHelpLink">
                <FormattedMessage
                  id="indexPatternManagement.script.getHelpLabel"
                  defaultMessage="Get help with the syntax and preview the results of your script."
                />
              </EuiLink>
            </EuiText>
          </Fragment>
        </EuiCompressedFormRow>
      </Fragment>
    ) : null;
  }

  showScriptingHelp = () => {
    this.setState({
      showScriptingHelp: true,
    });
  };

  hideScriptingHelp = () => {
    this.setState({
      showScriptingHelp: false,
    });
  };

  renderDeleteModal = () => {
    const { spec } = this.state;

    return this.state.showDeleteModal ? (
      <EuiConfirmModal
        title={i18n.translate('indexPatternManagement.deleteFieldHeader', {
          defaultMessage: "Delete field '{fieldName}'",
          values: { fieldName: spec.name },
        })}
        onCancel={this.hideDeleteModal}
        onConfirm={() => {
          this.hideDeleteModal();
          this.deleteField();
        }}
        cancelButtonText={i18n.translate('indexPatternManagement.deleteField.cancelButton', {
          defaultMessage: 'Cancel',
        })}
        confirmButtonText={i18n.translate('indexPatternManagement.deleteField.deleteButton', {
          defaultMessage: 'Delete',
        })}
        buttonColor="danger"
        defaultFocusedButton={EUI_MODAL_CONFIRM_BUTTON}
      >
        <p>
          <FormattedMessage
            id="indexPatternManagement.deleteFieldLabel"
            defaultMessage="You can't recover a deleted field.{separator}Are you sure you want to do this?"
            values={{
              separator: (
                <span>
                  <br />
                  <br />
                </span>
              ),
            }}
          />
        </p>
      </EuiConfirmModal>
    ) : null;
  };

  showDeleteModal = () => {
    this.setState({
      showDeleteModal: true,
    });
  };

  hideDeleteModal = () => {
    this.setState({
      showDeleteModal: false,
    });
  };

  renderActions() {
    const { isCreating, spec, isSaving } = this.state;
    const { redirectAway } = this.props.services;

    return (
      <EuiCompressedFormRow>
        <EuiFlexGroup>
          <EuiFlexItem grow={false}>
            <EuiSmallButton
              fill
              onClick={this.saveField}
              isDisabled={this.isSavingDisabled()}
              isLoading={isSaving}
              data-test-subj="fieldSaveButton"
            >
              {isCreating ? (
                <FormattedMessage
                  id="indexPatternManagement.actions.createButton"
                  defaultMessage="Create field"
                />
              ) : (
                <FormattedMessage
                  id="indexPatternManagement.actions.saveButton"
                  defaultMessage="Save field"
                />
              )}
            </EuiSmallButton>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiSmallButtonEmpty onClick={redirectAway} data-test-subj="fieldCancelButton">
              <FormattedMessage
                id="indexPatternManagement.actions.cancelButton"
                defaultMessage="Cancel"
              />
            </EuiSmallButtonEmpty>
          </EuiFlexItem>
          {!isCreating && spec.scripted ? (
            <EuiFlexItem>
              <EuiFlexGroup justifyContent="flexEnd">
                <EuiFlexItem grow={false}>
                  <EuiSmallButtonEmpty color="danger" onClick={this.showDeleteModal}>
                    <FormattedMessage
                      id="indexPatternManagement.actions.deleteButton"
                      defaultMessage="Delete"
                    />
                  </EuiSmallButtonEmpty>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexItem>
          ) : null}
        </EuiFlexGroup>
      </EuiCompressedFormRow>
    );
  }

  renderScriptingPanels = () => {
    const { scriptingLangs, spec, showScriptingHelp } = this.state;

    if (!spec.scripted) {
      return;
    }

    return (
      <Fragment>
        <ScriptingDisabledCallOut isVisible={!scriptingLangs.length} />
        <ScriptingWarningCallOut isVisible />
        <ScriptingHelpFlyout
          isVisible={showScriptingHelp}
          onClose={this.hideScriptingHelp}
          indexPattern={this.props.indexPattern}
          lang={spec.lang as string}
          name={spec.name}
          script={spec.script}
          executeScript={executeScript}
        />
      </Fragment>
    );
  };

  deleteField = () => {
    const { redirectAway, saveIndexPattern } = this.props.services;
    const { indexPattern } = this.props;
    const { spec } = this.state;
    indexPattern.removeScriptedField(spec.name);
    saveIndexPattern(indexPattern).then(() => {
      const message = i18n.translate('indexPatternManagement.deleteField.deletedHeader', {
        defaultMessage: "Deleted '{fieldName}'",
        values: { fieldName: spec.name },
      });
      this.context.services.notifications.toasts.addSuccess(message);
      redirectAway();
    });
  };

  saveField = async () => {
    const field = this.state.spec;
    const { indexPattern } = this.props;
    const { fieldFormatId } = this.state;

    if (field.scripted) {
      this.setState({
        isSaving: true,
      });

      const isValid = await isScriptValid({
        name: field.name,
        script: field.script as string,
        indexPatternTitle: indexPattern.title,
        http: this.context.services.http,
        dataSourceId: indexPattern.dataSourceRef?.id,
      });

      if (!isValid) {
        this.setState({
          hasScriptError: true,
          isSaving: false,
        });
        return;
      }
    }

    const { redirectAway, saveIndexPattern } = this.props.services;
    const fieldExists = !!indexPattern.fields.getByName(field.name);

    let oldField: IndexPatternField['spec'];

    if (fieldExists) {
      oldField = indexPattern.fields.getByName(field.name)!.spec;
      indexPattern.fields.update(field);
    } else {
      indexPattern.fields.add(field);
    }

    if (!fieldFormatId) {
      indexPattern.fieldFormatMap[field.name] = undefined;
    } else {
      indexPattern.fieldFormatMap[field.name] = field.format;
    }

    return saveIndexPattern(indexPattern)
      .then(() => {
        const message = i18n.translate('indexPatternManagement.deleteField.savedHeader', {
          defaultMessage: "Saved '{fieldName}'",
          values: { fieldName: field.name },
        });
        this.context.services.notifications.toasts.addSuccess(message);
        redirectAway();
      })
      .catch(() => {
        if (oldField) {
          indexPattern.fields.update(oldField);
        } else {
          indexPattern.fields.remove(field);
        }
      });
  };

  isSavingDisabled() {
    const { spec, hasFormatError, hasScriptError } = this.state;

    if (
      hasFormatError ||
      hasScriptError ||
      !spec.name ||
      !spec.name.trim() ||
      (spec.scripted && (!spec.script || !spec.script.trim()))
    ) {
      return true;
    }

    return false;
  }

  render() {
    const { isReady, isCreating, spec } = this.state;

    return isReady ? (
      <div>
        <EuiText>
          <h3>
            {isCreating ? (
              <FormattedMessage
                id="indexPatternManagement.createHeader"
                defaultMessage="Create scripted field"
              />
            ) : (
              <FormattedMessage
                id="indexPatternManagement.editHeader"
                defaultMessage="Edit {fieldName}"
                values={{ fieldName: spec.name }}
              />
            )}
          </h3>
        </EuiText>
        <EuiSpacer size="m" />
        <EuiForm>
          {this.renderScriptingPanels()}
          {this.renderName()}
          {this.renderLanguage()}
          {this.renderType()}
          {this.renderTypeConflict()}
          {this.renderFormat()}
          {this.renderPopularity()}
          {this.renderScript()}
          {this.renderActions()}
          {this.renderDeleteModal()}
        </EuiForm>
        <EuiSpacer size="l" />
      </div>
    ) : null;
  }
}
