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

import React from 'react';
import ReactResizeDetector from 'react-resize-detector';
import MonacoEditor from 'react-monaco-editor';

import { monaco } from '@osd/monaco';

import { LIGHT_THEME, DARK_THEME, DEFAULT_DARK_THEME, DEAFULT_LIGHT_THEME } from './editor_theme';

import './editor.scss';

export interface Props {
  /** Width of editor. Defaults to 100%. */
  width?: string | number;

  /** Height of editor. Defaults to 100%. */
  height?: string | number;

  /** ID of the editor language */
  languageId: string;

  /** Value of the editor */
  value: string;

  /** Function invoked when text in editor is changed */
  onChange: (value: string) => void;

  /**
   * Options for the Monaco Code Editor
   * Documentation of options can be found here:
   * https://microsoft.github.io/monaco-editor/docs.html#interfaces/editor.IEditorConstructionOptions.html
   */
  options?: monaco.editor.IEditorConstructionOptions;

  /**
   * Suggestion provider for autocompletion
   * Documentation for the provider can be found here:
   * https://microsoft.github.io/monaco-editor/docs.html#interfaces/languages.CompletionItemProvider.html
   */
  suggestionProvider?: monaco.languages.CompletionItemProvider;

  /**
   * Signature provider for function parameter info
   * Documentation for the provider can be found here:
   * https://microsoft.github.io/monaco-editor/docs.html#interfaces/languages.SignatureHelpProvider.html
   */
  signatureProvider?: monaco.languages.SignatureHelpProvider;

  /**
   * Hover provider for hover documentation
   * Documentation for the provider can be found here:
   * https://microsoft.github.io/monaco-editor/docs.html#interfaces/languages.HoverProvider.html
   */
  hoverProvider?: monaco.languages.HoverProvider;

  /**
   * Language config provider for bracket
   * Documentation for the provider can be found here:
   * https://microsoft.github.io/monaco-editor/docs.html#interfaces/languages.LanguageConfiguration.html
   */
  languageConfiguration?: monaco.languages.LanguageConfiguration;

  /**
   * Function called before the editor is mounted in the view
   */
  editorWillMount?: () => void;
  /**
   * Function called before the editor is mounted in the view
   * and completely replaces the setup behavior called by the component
   */
  overrideEditorWillMount?: () => void;

  /**
   * Function called after the editor is mounted in the view
   */
  editorDidMount?: (editor: monaco.editor.IStandaloneCodeEditor) => void;

  /**
   * Should the editor use the dark theme
   */
  useDarkTheme?: boolean;

  /**
   * Whether the suggestion widget/window will be triggered upon clicking into the editor
   */
  triggerSuggestOnFocus?: boolean;

  /**
   * Should the editor use latest theme variations for dark and light theme. By default it is false and editor uses default themes
   */
  useLatestTheme?: boolean;
}

export class CodeEditor extends React.Component<Props, {}> {
  _editor: monaco.editor.IStandaloneCodeEditor | null = null;

  _editorWillMount = (__monaco: unknown) => {
    if (__monaco !== monaco) {
      throw new Error('react-monaco-editor is using a different version of monaco');
    }

    if (this.props.overrideEditorWillMount) {
      this.props.overrideEditorWillMount();
      return;
    }

    if (this.props.editorWillMount) {
      this.props.editorWillMount();
    }

    // Register the theme
    monaco.editor.defineTheme(
      'euiColors',
      this.props.useLatestTheme
        ? this.props.useDarkTheme
          ? DARK_THEME
          : LIGHT_THEME
        : this.props.useDarkTheme
        ? DEFAULT_DARK_THEME
        : DEAFULT_LIGHT_THEME
    );
  };

  _editorDidMount = (editor: monaco.editor.IStandaloneCodeEditor, __monaco: unknown) => {
    if (__monaco !== monaco) {
      throw new Error('react-monaco-editor is using a different version of monaco');
    }

    this._editor = editor;

    if (this.props.editorDidMount) {
      this.props.editorDidMount(editor);
    }

    if (this.props.triggerSuggestOnFocus) {
      editor.onDidFocusEditorWidget(() => {
        editor.trigger('keyboard', 'editor.action.triggerSuggest', {});
      });
    }
    // Show the documentation panel by default
    const suggestController = editor.getContribution('editor.contrib.suggestController') as any;
    suggestController.widget.value._setDetailsVisible(true);
  };

  render() {
    const { languageId, value, onChange, width, height, options } = this.props;

    monaco.languages.onLanguage(languageId, () => {
      if (this.props.suggestionProvider) {
        monaco.languages.registerCompletionItemProvider(languageId, this.props.suggestionProvider);
      }

      if (this.props.signatureProvider) {
        monaco.languages.registerSignatureHelpProvider(languageId, this.props.signatureProvider);
      }

      if (this.props.hoverProvider) {
        monaco.languages.registerHoverProvider(languageId, this.props.hoverProvider);
      }

      if (this.props.languageConfiguration) {
        monaco.languages.setLanguageConfiguration(languageId, this.props.languageConfiguration);
      }
    });

    return (
      <React.Fragment>
        <MonacoEditor
          theme="euiColors"
          language={languageId}
          value={value}
          onChange={onChange}
          editorWillMount={this._editorWillMount}
          editorDidMount={this._editorDidMount}
          width={width}
          height={height}
          options={options}
        />
        <ReactResizeDetector handleWidth handleHeight onResize={this._updateDimensions} />
      </React.Fragment>
    );
  }

  _updateDimensions = () => {
    if (this._editor) {
      this._editor.layout();
    }
  };
}

// React.lazy requires default export
// eslint-disable-next-line import/no-default-export
export default CodeEditor;
