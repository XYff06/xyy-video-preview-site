import json
import sys
from dataclasses import dataclass
from typing import Any, Dict, List, Optional
from urllib.parse import quote

import requests
from PyQt5.QtCore import Qt
from PyQt5.QtWidgets import (
    QApplication,
    QComboBox,
    QFormLayout,
    QGridLayout,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QListWidget,
    QListWidgetItem,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QSpinBox,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)


@dataclass
class ApiResponse:
    ok: bool
    status: int
    payload: Dict[str, Any]


class ApiClient:
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip('/')

    def set_base_url(self, base_url: str) -> None:
        self.base_url = base_url.rstrip('/')

    def request(self, method: str, path: str, body: Optional[Dict[str, Any]] = None) -> ApiResponse:
        url = f"{self.base_url}{path}"
        try:
            response = requests.request(method=method, url=url, json=body, timeout=20)
            try:
                payload = response.json()
            except Exception:
                payload = {'message': response.text}
            return ApiResponse(ok=response.ok, status=response.status_code, payload=payload)
        except Exception as exc:
            return ApiResponse(ok=False, status=0, payload={'message': f'请求失败：{exc}'})

    def list_tags(self) -> List[str]:
        res = self.request('GET', '/api/tags')
        if not res.ok:
            raise RuntimeError(res.payload.get('message', '加载标签失败'))
        items = res.payload.get('data', [])
        if not isinstance(items, list):
            return []
        names: List[str] = []
        for item in items:
            if isinstance(item, str):
                names.append(item)
            elif isinstance(item, dict):
                value = str(item.get('tagName') or item.get('tag_name') or '').strip()
                if value:
                    names.append(value)
        return names

    def list_series(self) -> List[Dict[str, Any]]:
        res = self.request('GET', '/api/series?page=1&pageSize=500')
        if not res.ok:
            raise RuntimeError(res.payload.get('message', '加载剧集失败'))
        items = res.payload.get('data', {}).get('items', [])
        return items if isinstance(items, list) else []


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle('视频站管理端（Qt5）')
        self.resize(1050, 820)

        self.client = ApiClient('http://127.0.0.1:4173')
        self.tags: List[str] = []
        self.series: List[Dict[str, Any]] = []

        root = QWidget()
        root_layout = QVBoxLayout(root)

        conn_box = QGroupBox('服务连接')
        conn_layout = QHBoxLayout(conn_box)
        self.base_url_input = QLineEdit(self.client.base_url)
        self.base_url_input.setPlaceholderText('http://127.0.0.1:4173')
        self.btn_ping = QPushButton('测试连接')
        self.btn_ping.clicked.connect(self.test_connection)
        self.btn_reload = QPushButton('刷新基础数据')
        self.btn_reload.clicked.connect(self.reload_master_data)
        conn_layout.addWidget(QLabel('API Base URL:'))
        conn_layout.addWidget(self.base_url_input, 1)
        conn_layout.addWidget(self.btn_ping)
        conn_layout.addWidget(self.btn_reload)

        self.panel = QWidget()
        panel_layout = QGridLayout(self.panel)
        panel_layout.addWidget(self.build_tag_panel(), 0, 0)
        panel_layout.addWidget(self.build_title_panel(), 0, 1)
        panel_layout.addWidget(self.build_episode_panel(), 1, 0, 1, 2)

        self.log = QTextEdit()
        self.log.setReadOnly(True)
        self.log.setPlaceholderText('操作日志')

        root_layout.addWidget(conn_box)
        root_layout.addWidget(self.panel, 1)
        root_layout.addWidget(QLabel('日志'))
        root_layout.addWidget(self.log, 1)

        self.setCentralWidget(root)

    # ---------- helpers ----------
    def append_log(self, text: str) -> None:
        self.log.append(text)

    def sync_base_url(self) -> None:
        value = self.base_url_input.text().strip()
        if not value:
            raise RuntimeError('API Base URL 不能为空')
        self.client.set_base_url(value)

    def selected_tags(self, widget: QListWidget) -> List[str]:
        return [item.text() for item in widget.selectedItems() if item.text().strip()]

    def fill_tag_list(self, widget: QListWidget, values: List[str]) -> None:
        widget.clear()
        for v in values:
            item = QListWidgetItem(v)
            widget.addItem(item)

    def fill_series_combo(self, combo: QComboBox) -> None:
        combo.clear()
        combo.addItem('')
        for item in self.series:
            name = str(item.get('name') or '').strip()
            if name:
                combo.addItem(name)

    def fill_episode_combo(self, title_name: str, combo: QComboBox) -> None:
        combo.clear()
        combo.addItem('')
        target = None
        for item in self.series:
            if str(item.get('name') or '').strip() == title_name:
                target = item
                break
        if not target:
            return
        episodes = target.get('episodes') or []
        sorted_eps = sorted(
            [ep for ep in episodes if isinstance(ep, dict)],
            key=lambda x: int(x.get('episode') or 0),
        )
        for ep in sorted_eps:
            episode_no = int(ep.get('episode') or 0)
            if episode_no <= 0:
                continue
            combo.addItem(str(episode_no), ep)

    def notify(self, ok: bool, text: str, detail: Optional[Dict[str, Any]] = None) -> None:
        icon = '✅' if ok else '❌'
        self.append_log(f'{icon} {text}')
        if detail:
            self.append_log(json.dumps(detail, ensure_ascii=False))
        if ok:
            QMessageBox.information(self, '成功', text)
        else:
            QMessageBox.critical(self, '失败', text)

    def call_api(self, method: str, path: str, body: Optional[Dict[str, Any]] = None, refresh_data: bool = False) -> bool:
        try:
            self.sync_base_url()
        except Exception as exc:
            self.notify(False, str(exc))
            return False

        res = self.client.request(method, path, body)
        msg = str(res.payload.get('message') or '').strip() or f'HTTP {res.status}'
        self.notify(res.ok, f'{method} {path} -> {msg}', res.payload)
        if res.ok and refresh_data:
            self.reload_master_data(silent=True)
        return res.ok

    # ---------- lifecycle ----------
    def showEvent(self, event):  # type: ignore[override]
        super().showEvent(event)
        if not self.tags and not self.series:
            self.reload_master_data(silent=True)

    def test_connection(self) -> None:
        try:
            self.sync_base_url()
        except Exception as exc:
            self.notify(False, str(exc))
            return
        res = self.client.request('GET', '/api/health')
        msg = '连接成功' if res.ok else res.payload.get('message', '连接失败')
        self.notify(res.ok, f'{msg}（HTTP {res.status}）', res.payload)

    def reload_master_data(self, silent: bool = False) -> None:
        try:
            self.sync_base_url()
            self.tags = self.client.list_tags()
            self.series = self.client.list_series()
            self.refill_all_widgets()
            if not silent:
                self.notify(True, f'刷新完成：{len(self.tags)} 个标签，{len(self.series)} 部漫剧')
        except Exception as exc:
            self.notify(False, f'刷新失败：{exc}')

    def refill_all_widgets(self) -> None:
        self.fill_tag_list(self.title_create_tags, self.tags)
        self.fill_tag_list(self.title_update_tags, self.tags)
        self.fill_tag_list(self.batch_tags, self.tags)

        self.fill_series_combo(self.ep_create_title)
        self.fill_series_combo(self.ep_update_title)
        self.fill_series_combo(self.ep_delete_title)
        self.fill_series_combo(self.title_delete_name)
        self.fill_series_combo(self.title_update_old_name)

        self.on_update_title_changed()
        self.on_delete_title_changed()
        self.on_title_update_prefill()

    # ---------- tag panel ----------
    def build_tag_panel(self) -> QWidget:
        panel = QGroupBox('标签管理')
        layout = QVBoxLayout(panel)

        create_box = QGroupBox('新增标签')
        create_form = QFormLayout(create_box)
        self.tag_create_name = QLineEdit()
        btn_create = QPushButton('新增')
        btn_create.clicked.connect(self.on_tag_create)
        create_form.addRow('标签名', self.tag_create_name)
        create_form.addRow(btn_create)

        rename_box = QGroupBox('修改标签')
        rename_form = QFormLayout(rename_box)
        self.tag_old_name = QLineEdit()
        self.tag_new_name = QLineEdit()
        btn_rename = QPushButton('修改')
        btn_rename.clicked.connect(self.on_tag_rename)
        rename_form.addRow('旧标签名', self.tag_old_name)
        rename_form.addRow('新标签名', self.tag_new_name)
        rename_form.addRow(btn_rename)

        delete_box = QGroupBox('删除标签')
        delete_form = QFormLayout(delete_box)
        self.tag_delete_name = QLineEdit()
        btn_delete = QPushButton('删除')
        btn_delete.clicked.connect(self.on_tag_delete)
        delete_form.addRow('标签名', self.tag_delete_name)
        delete_form.addRow(btn_delete)

        layout.addWidget(create_box)
        layout.addWidget(rename_box)
        layout.addWidget(delete_box)
        return panel

    def on_tag_create(self) -> None:
        tag_name = self.tag_create_name.text().strip()
        if not tag_name:
            self.notify(False, '标签名不能为空')
            return
        ok = self.call_api('POST', '/api/tags', {'tagName': tag_name}, refresh_data=True)
        if ok:
            self.tag_create_name.clear()

    def on_tag_rename(self) -> None:
        old = self.tag_old_name.text().strip()
        new = self.tag_new_name.text().strip()
        if not old or not new:
            self.notify(False, '旧标签名、新标签名都不能为空')
            return
        ok = self.call_api('PATCH', f'/api/tags/{quote(old)}', {'newTagName': new}, refresh_data=True)
        if ok:
            self.tag_old_name.clear()
            self.tag_new_name.clear()

    def on_tag_delete(self) -> None:
        name = self.tag_delete_name.text().strip()
        if not name:
            self.notify(False, '标签名不能为空')
            return
        ok = self.call_api('DELETE', f'/api/tags/{quote(name)}', refresh_data=True)
        if ok:
            self.tag_delete_name.clear()

    # ---------- title panel ----------
    def build_title_panel(self) -> QWidget:
        panel = QGroupBox('漫剧管理')
        layout = QVBoxLayout(panel)

        create_box = QGroupBox('新增漫剧')
        create_form = QFormLayout(create_box)
        self.title_create_name = QLineEdit()
        self.title_create_poster = QLineEdit()
        self.title_create_tags = QListWidget()
        self.title_create_tags.setSelectionMode(QListWidget.MultiSelection)
        btn_create = QPushButton('新增')
        btn_create.clicked.connect(self.on_title_create)
        create_form.addRow('漫剧名', self.title_create_name)
        create_form.addRow('海报 URL', self.title_create_poster)
        create_form.addRow('标签（多选）', self.title_create_tags)
        create_form.addRow(btn_create)

        update_box = QGroupBox('修改漫剧')
        update_form = QFormLayout(update_box)
        self.title_update_old_name = QComboBox()
        self.title_update_old_name.currentTextChanged.connect(self.on_title_update_prefill)
        self.title_update_new_name = QLineEdit()
        self.title_update_poster = QLineEdit()
        self.title_update_tags = QListWidget()
        self.title_update_tags.setSelectionMode(QListWidget.MultiSelection)
        btn_update = QPushButton('修改')
        btn_update.clicked.connect(self.on_title_update)
        update_form.addRow('选择旧漫剧', self.title_update_old_name)
        update_form.addRow('新漫剧名', self.title_update_new_name)
        update_form.addRow('新海报 URL', self.title_update_poster)
        update_form.addRow('标签（多选）', self.title_update_tags)
        update_form.addRow(btn_update)

        delete_box = QGroupBox('删除漫剧')
        delete_form = QFormLayout(delete_box)
        self.title_delete_name = QComboBox()
        btn_delete = QPushButton('删除')
        btn_delete.clicked.connect(self.on_title_delete)
        delete_form.addRow('漫剧名', self.title_delete_name)
        delete_form.addRow(btn_delete)

        layout.addWidget(create_box)
        layout.addWidget(update_box)
        layout.addWidget(delete_box)
        return panel

    def on_title_create(self) -> None:
        name = self.title_create_name.text().strip()
        poster = self.title_create_poster.text().strip()
        tags = self.selected_tags(self.title_create_tags)
        if not name or not poster:
            self.notify(False, '漫剧名和海报 URL 不能为空')
            return
        if not tags:
            self.notify(False, '至少选择一个标签')
            return
        ok = self.call_api('POST', '/api/titles', {'name': name, 'poster': poster, 'tags': tags}, refresh_data=True)
        if ok:
            self.title_create_name.clear()
            self.title_create_poster.clear()

    def on_title_update_prefill(self) -> None:
        current = self.title_update_old_name.currentText().strip()
        if not current:
            self.title_update_new_name.clear()
            self.title_update_poster.clear()
            return
        target = None
        for s in self.series:
            if str(s.get('name') or '').strip() == current:
                target = s
                break
        if not target:
            return
        self.title_update_new_name.setText(str(target.get('name') or ''))
        self.title_update_poster.setText(str(target.get('poster') or ''))

    def on_title_update(self) -> None:
        old = self.title_update_old_name.currentText().strip()
        new_name = self.title_update_new_name.text().strip()
        poster = self.title_update_poster.text().strip()
        tags = self.selected_tags(self.title_update_tags)
        if not old:
            self.notify(False, '请先选择旧漫剧')
            return
        if not new_name or not poster:
            self.notify(False, '新漫剧名和海报 URL 不能为空')
            return
        if not tags:
            self.notify(False, '至少选择一个标签')
            return
        ok = self.call_api(
            'PATCH',
            f'/api/titles/{quote(old)}',
            {'newName': new_name, 'poster': poster, 'tags': tags},
            refresh_data=True,
        )
        if ok:
            self.title_update_new_name.clear()
            self.title_update_poster.clear()

    def on_title_delete(self) -> None:
        name = self.title_delete_name.currentText().strip()
        if not name:
            self.notify(False, '请选择要删除的漫剧')
            return
        self.call_api('DELETE', f'/api/titles/{quote(name)}', refresh_data=True)

    # ---------- episode panel ----------
    def build_episode_panel(self) -> QWidget:
        panel = QGroupBox('剧集管理')
        layout = QHBoxLayout(panel)

        # left: create + batch
        left = QWidget()
        left_layout = QVBoxLayout(left)

        create_box = QGroupBox('新增单集')
        create_form = QFormLayout(create_box)
        self.ep_create_title = QComboBox()
        self.ep_create_no = QSpinBox()
        self.ep_create_no.setRange(1, 999999)
        self.ep_create_url = QLineEdit()
        btn_ep_create = QPushButton('新增')
        btn_ep_create.clicked.connect(self.on_episode_create)
        create_form.addRow('漫剧', self.ep_create_title)
        create_form.addRow('集号', self.ep_create_no)
        create_form.addRow('播放 URL', self.ep_create_url)
        create_form.addRow(btn_ep_create)

        batch_box = QGroupBox('批量导入（目录 URL）')
        batch_form = QFormLayout(batch_box)
        self.batch_name = QLineEdit()
        self.batch_poster = QLineEdit()
        self.batch_dir = QLineEdit()
        self.batch_tags = QListWidget()
        self.batch_tags.setSelectionMode(QListWidget.MultiSelection)
        btn_batch = QPushButton('批量导入')
        btn_batch.clicked.connect(self.on_episode_batch)
        batch_form.addRow('漫剧名', self.batch_name)
        batch_form.addRow('海报 URL', self.batch_poster)
        batch_form.addRow('目录 URL', self.batch_dir)
        batch_form.addRow('标签（多选）', self.batch_tags)
        batch_form.addRow(btn_batch)

        left_layout.addWidget(create_box)
        left_layout.addWidget(batch_box)

        # right: update + delete
        right = QWidget()
        right_layout = QVBoxLayout(right)

        update_box = QGroupBox('修改单集')
        update_form = QFormLayout(update_box)
        self.ep_update_title = QComboBox()
        self.ep_update_title.currentTextChanged.connect(self.on_update_title_changed)
        self.ep_update_no = QComboBox()
        self.ep_update_no.currentTextChanged.connect(self.on_update_episode_changed)
        self.ep_update_new_no = QSpinBox()
        self.ep_update_new_no.setRange(1, 999999)
        self.ep_update_url = QLineEdit()
        btn_ep_update = QPushButton('修改')
        btn_ep_update.clicked.connect(self.on_episode_update)
        update_form.addRow('漫剧', self.ep_update_title)
        update_form.addRow('旧集号', self.ep_update_no)
        update_form.addRow('新集号', self.ep_update_new_no)
        update_form.addRow('新 URL', self.ep_update_url)
        update_form.addRow(btn_ep_update)

        delete_box = QGroupBox('删除单集')
        delete_form = QFormLayout(delete_box)
        self.ep_delete_title = QComboBox()
        self.ep_delete_title.currentTextChanged.connect(self.on_delete_title_changed)
        self.ep_delete_no = QComboBox()
        btn_ep_delete = QPushButton('删除')
        btn_ep_delete.clicked.connect(self.on_episode_delete)
        delete_form.addRow('漫剧', self.ep_delete_title)
        delete_form.addRow('集号', self.ep_delete_no)
        delete_form.addRow(btn_ep_delete)

        right_layout.addWidget(update_box)
        right_layout.addWidget(delete_box)

        layout.addWidget(left, 1)
        layout.addWidget(right, 1)
        return panel

    def on_episode_create(self) -> None:
        title = self.ep_create_title.currentText().strip()
        video_url = self.ep_create_url.text().strip()
        episode_no = self.ep_create_no.value()
        if not title or not video_url:
            self.notify(False, '漫剧和播放 URL 不能为空')
            return
        ok = self.call_api(
            'POST',
            '/api/episodes',
            {'titleName': title, 'episodeNo': episode_no, 'videoUrl': video_url},
            refresh_data=True,
        )
        if ok:
            self.ep_create_url.clear()

    def on_episode_batch(self) -> None:
        name = self.batch_name.text().strip()
        poster = self.batch_poster.text().strip()
        directory_url = self.batch_dir.text().strip()
        tags = self.selected_tags(self.batch_tags)
        if not name or not poster or not directory_url:
            self.notify(False, '漫剧名、海报 URL、目录 URL 都不能为空')
            return
        if not tags:
            self.notify(False, '批量导入至少选择一个标签')
            return
        ok = self.call_api(
            'POST',
            '/api/episodes/batch-directory',
            {'name': name, 'poster': poster, 'directoryUrl': directory_url, 'tags': tags},
            refresh_data=True,
        )
        if ok:
            self.batch_name.clear()
            self.batch_poster.clear()
            self.batch_dir.clear()

    def on_update_title_changed(self) -> None:
        title = self.ep_update_title.currentText().strip()
        self.fill_episode_combo(title, self.ep_update_no)
        self.on_update_episode_changed()

    def on_update_episode_changed(self) -> None:
        data = self.ep_update_no.currentData()
        if not isinstance(data, dict):
            self.ep_update_url.clear()
            self.ep_update_new_no.setValue(1)
            return
        old_no = int(data.get('episode') or 1)
        video_url = str(data.get('videoUrl') or '')
        self.ep_update_new_no.setValue(max(1, old_no))
        self.ep_update_url.setText(video_url)

    def on_episode_update(self) -> None:
        title = self.ep_update_title.currentText().strip()
        old_no_text = self.ep_update_no.currentText().strip()
        new_no = self.ep_update_new_no.value()
        new_url = self.ep_update_url.text().strip()
        if not title or not old_no_text or not new_url:
            self.notify(False, '漫剧、旧集号、新 URL 都不能为空')
            return
        old_no = int(old_no_text)
        self.call_api(
            'PATCH',
            '/api/episodes',
            {'titleName': title, 'episodeNo': old_no, 'newEpisodeNo': new_no, 'videoUrl': new_url},
            refresh_data=True,
        )

    def on_delete_title_changed(self) -> None:
        title = self.ep_delete_title.currentText().strip()
        self.fill_episode_combo(title, self.ep_delete_no)

    def on_episode_delete(self) -> None:
        title = self.ep_delete_title.currentText().strip()
        ep_text = self.ep_delete_no.currentText().strip()
        if not title or not ep_text:
            self.notify(False, '请选择漫剧和集号')
            return
        self.call_api(
            'DELETE',
            '/api/episodes',
            {'titleName': title, 'episodeNo': int(ep_text)},
            refresh_data=True,
        )


def main() -> int:
    app = QApplication(sys.argv)
    app.setApplicationName('视频站管理端（Qt5）')
    app.setAttribute(Qt.AA_EnableHighDpiScaling, True)

    window = MainWindow()
    window.show()

    return app.exec_()


if __name__ == '__main__':
    sys.exit(main())
