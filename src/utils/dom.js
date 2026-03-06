import { TAG_MULTI_SELECT_PLACEHOLDER } from '../config/constants.js';

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function setFieldError(errorNode, message = '') {
  if (!errorNode) return;
  errorNode.textContent = message;
  errorNode.classList.toggle('hidden', !message);
}

export function validateTagSelection(formNode, fieldName, errorNode, message) {
  const checkboxes = [...formNode.querySelectorAll(`input[name="${fieldName}"]`)];
  if (checkboxes.length === 0) return false;

  const hasSelection = checkboxes.some((checkbox) => checkbox.checked);
  setFieldError(errorNode, hasSelection ? '' : message);
  return hasSelection;
}

export function getTagMultiSelectHtml(fieldName, tags, selectedTags = []) {
  if (!tags.length) {
    return '<div class="multi-select-empty">暂无可选标签</div>';
  }

  const selectedTagSet = new Set(selectedTags);
  const selectedText = selectedTagSet.size
    ? [...selectedTagSet].map((tag) => escapeHtml(tag)).join('、')
    : TAG_MULTI_SELECT_PLACEHOLDER;

  return `
    <details class="multi-select" data-multi-select>
      <summary class="multi-select-summary" data-multi-summary>${selectedText}</summary>
      <div class="multi-select-list">
        ${tags.map((tag) => `
          <label class="multi-select-item">
            <input type="checkbox" name="${fieldName}" value="${escapeHtml(tag)}" ${selectedTagSet.has(tag) ? 'checked' : ''} />
            <span>${escapeHtml(tag)}</span>
          </label>
        `).join('')}
      </div>
    </details>
  `;
}

export function bindMultiSelectSummary(scopeNode) {
  scopeNode.querySelectorAll('[data-multi-select]').forEach((multiSelectNode) => {
    const summaryNode = multiSelectNode.querySelector('[data-multi-summary]');
    if (!summaryNode) return;

    const updateSummaryText = () => {
      const selectedValues = [...multiSelectNode.querySelectorAll('input[type="checkbox"]:checked')]
        .map((inputNode) => inputNode.value);
      summaryNode.textContent = selectedValues.length
        ? selectedValues.join('、')
        : TAG_MULTI_SELECT_PLACEHOLDER;
    };

    multiSelectNode.querySelectorAll('input[type="checkbox"]').forEach((inputNode) => {
      if (inputNode.dataset.summaryBound === '1') return;
      inputNode.addEventListener('change', updateSummaryText);
      inputNode.dataset.summaryBound = '1';
    });

    updateSummaryText();
  });
}
