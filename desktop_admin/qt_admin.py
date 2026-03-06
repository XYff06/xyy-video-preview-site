import json
import sys
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import requests
from PyQt5.QtCore import Qt
from PyQt5.QtWidgets import (
    QApplication,
    QFormLayout,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QSpinBox,
    QTabWidget,
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
            resp = requests.request(method, url, json=body, timeout=15)
            payload: Dict[str, Any]
            try:
                payload = resp.json()
            except Exception:
                payload = {"message": resp.text}
            return ApiResponse(resp.ok, resp.status_code, payload)
        except Exception as exc:
            return ApiResponse(False, 0, {"message": f"请求失败: {exc}"})

    def list_series(self) -> List[Dict[str, Any]]:
        result = self.request('GET', '/api/series?page=1&pageSize=500')
        if not result.ok:
            raise RuntimeError(result.payload.get('message', '加载剧集失败'))
        data = result.payload.get('data', {})
        return data.get('items', [])

    def list_tags(self) -> List[Dict[str, Any]]:
        result = self.request('GET', '/api/tags')
        if not result.ok:
            raise RuntimeError(result.payload.get('message', '加载标签失败'))
        data = result.payload.get('data', [])
        return data if isinstance(data, list) else []


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle('视频站管理端（Qt5）')
        self.resize(920, 760)

        self.client = ApiClient('http://127.0.0.1:4173')

        root = QWidget()
        root_layout = QVBoxLayout(root)

        conn_box = QGroupBox('服务连接')
        conn_layout = QHBoxLayout(conn_box)
        self.base_url_input = QLineEdit(self.client.base_url)
        self.base_url_input.setPlaceholderText('http://127.0.0.1:4173')
        self.test_btn = QPushButton('测试连接')
        self.test_btn.clicked.connect(self.test_connection)
        conn_layout.addWidget(QLabel('API Base URL:'))
        conn_layout.addWidget(self.base_url_input, 1)
        conn_layout.addWidget(self.test_btn)

        self.tabs = QTabWidget()
        self.tabs.addTab(self.build_tag_tab(), '标签管理')
        self.tabs.addTab(self.build_title_tab(), '漫剧管理')
        self.tabs.addTab(self.build_episode_tab(), '剧集管理')

        self.log = QTextEdit()
        self.log.setReadOnly(True)
        self.log.setPlaceholderText('操作日志...')

        root_layout.addWidget(conn_box)
        root_layout.addWidget(self.tabs, 1)
        root_layout.addWidget(QLabel('日志'))
        root_layout.addWidget(self.log, 1)

        self.setCentralWidget(root)

    def sync_base_url(self) -> None:
        base = self.base_url_input.text().strip()
        if not base:
            raise RuntimeError('Base URL 不能为空')
        self.client.set_base_url(base)

    def append_log(self, message: str) -> None:
        self.log.append(message)

    def show_error(self, message: str) -> None:
        self.append_log(f"❌ {message}")
        QMessageBox.critical(self, '错误', message)

    def show_ok(self, message: str) -> None:
        self.append_log(f"✅ {message}")
        QMessageBox.information(self, '成功', message)

    def test_connection(self) -> None:
        try:
            self.sync_base_url()
        except Exception as exc:
            self.show_error(str(exc))
            return
        result = self.client.request('GET', '/api/health')
        if result.ok:
            self.show_ok(f"连接成功（HTTP {result.status}）")
        else:
            self.show_error(result.payload.get('message', f"连接失败（HTTP {result.status}）"))

    def do_request(self, method: str, path: str, body: Optional[Dict[str, Any]] = None) -> None:
        try:
            self.sync_base_url()
        except Exception as exc:
            self.show_error(str(exc))
            return

        result = self.client.request(method, path, body)
        msg = result.payload.get('message', '')
        detail = json.dumps(result.payload, ensure_ascii=False)
        if result.ok:
            self.show_ok(f"{method} {path} 成功。{msg}")
            self.append_log(detail)
        else:
            self.show_error(f"{method} {path} 失败。{msg or detail}")

    def build_tag_tab(self) -> QWidget:
        tab = QWidget()
        layout = QVBoxLayout(tab)

        create_box = QGroupBox('新增标签')
        create_form = QFormLayout(create_box)
        self.tag_name = QLineEdit()
        self.tag_sort = QSpinBox()
        self.tag_sort.setRange(0, 999999)
        create_btn = QPushButton('新增')
        create_btn.clicked.connect(
            lambda: self.do_request('POST', '/api/tags', {
                'name': self.tag_name.text().strip(),
                'sortNo': self.tag_sort.value(),
            })
        )
        create_form.addRow('标签名', self.tag_name)
        create_form.addRow('排序号', self.tag_sort)
        create_form.addRow(create_btn)

        update_box = QGroupBox('修改标签')
        update_form = QFormLayout(update_box)
        self.tag_old_name = QLineEdit()
        self.tag_new_name = QLineEdit()
        self.tag_new_sort = QSpinBox()
        self.tag_new_sort.setRange(0, 999999)
        update_btn = QPushButton('修改')
        update_btn.clicked.connect(
            lambda: self.do_request('PATCH', f"/api/tags/{requests.utils.quote(self.tag_old_name.text().strip())}", {
                'newName': self.tag_new_name.text().strip(),
                'sortNo': self.tag_new_sort.value(),
            })
        )
        update_form.addRow('旧标签名', self.tag_old_name)
        update_form.addRow('新标签名', self.tag_new_name)
        update_form.addRow('新排序号', self.tag_new_sort)
        update_form.addRow(update_btn)

        delete_box = QGroupBox('删除标签')
        delete_form = QFormLayout(delete_box)
        self.tag_delete_name = QLineEdit()
        delete_btn = QPushButton('删除')
        delete_btn.clicked.connect(
            lambda: self.do_request('DELETE', f"/api/tags/{requests.utils.quote(self.tag_delete_name.text().strip())}")
        )
        delete_form.addRow('标签名', self.tag_delete_name)
        delete_form.addRow(delete_btn)

        layout.addWidget(create_box)
        layout.addWidget(update_box)
        layout.addWidget(delete_box)
        layout.addStretch(1)
        return tab

    def build_title_tab(self) -> QWidget:
        tab = QWidget()
        layout = QVBoxLayout(tab)

        create_box = QGroupBox('新增漫剧')
        create_form = QFormLayout(create_box)
        self.title_name = QLineEdit()
        self.title_poster = QLineEdit()
        self.title_tags = QLineEdit()
        self.title_tags.setPlaceholderText('逗号分隔，例如 热血,冒险')
        create_btn = QPushButton('新增')
        create_btn.clicked.connect(
            lambda: self.do_request('POST', '/api/titles', {
                'name': self.title_name.text().strip(),
                'poster': self.title_poster.text().strip(),
                'tags': [x.strip() for x in self.title_tags.text().split(',') if x.strip()],
            })
        )
        create_form.addRow('漫剧名', self.title_name)
        create_form.addRow('海报 URL', self.title_poster)
        create_form.addRow('标签列表', self.title_tags)
        create_form.addRow(create_btn)

        update_box = QGroupBox('修改漫剧')
        update_form = QFormLayout(update_box)
        self.title_old = QLineEdit()
        self.title_new = QLineEdit()
        self.title_new_poster = QLineEdit()
        self.title_new_tags = QLineEdit()
        update_btn = QPushButton('修改')
        update_btn.clicked.connect(
            lambda: self.do_request('PATCH', f"/api/titles/{requests.utils.quote(self.title_old.text().strip())}", {
                'newName': self.title_new.text().strip(),
                'poster': self.title_new_poster.text().strip(),
                'tags': [x.strip() for x in self.title_new_tags.text().split(',') if x.strip()],
            })
        )
        update_form.addRow('旧漫剧名', self.title_old)
        update_form.addRow('新漫剧名', self.title_new)
        update_form.addRow('新海报 URL', self.title_new_poster)
        update_form.addRow('新标签列表', self.title_new_tags)
        update_form.addRow(update_btn)

        delete_box = QGroupBox('删除漫剧')
        delete_form = QFormLayout(delete_box)
        self.title_delete_name = QLineEdit()
        delete_btn = QPushButton('删除')
        delete_btn.clicked.connect(
            lambda: self.do_request('DELETE', f"/api/titles/{requests.utils.quote(self.title_delete_name.text().strip())}")
        )
        delete_form.addRow('漫剧名', self.title_delete_name)
        delete_form.addRow(delete_btn)

        layout.addWidget(create_box)
        layout.addWidget(update_box)
        layout.addWidget(delete_box)
        layout.addStretch(1)
        return tab

    def build_episode_tab(self) -> QWidget:
        tab = QWidget()
        layout = QVBoxLayout(tab)

        create_box = QGroupBox('新增单集')
        create_form = QFormLayout(create_box)
        self.ep_title = QLineEdit()
        self.ep_no = QSpinBox()
        self.ep_no.setRange(1, 999999)
        self.ep_url = QLineEdit()
        create_btn = QPushButton('新增')
        create_btn.clicked.connect(
            lambda: self.do_request('POST', '/api/episodes', {
                'titleName': self.ep_title.text().strip(),
                'episodeNo': self.ep_no.value(),
                'videoUrl': self.ep_url.text().strip(),
            })
        )
        create_form.addRow('漫剧名', self.ep_title)
        create_form.addRow('集号', self.ep_no)
        create_form.addRow('播放 URL', self.ep_url)
        create_form.addRow(create_btn)

        batch_box = QGroupBox('批量导入（目录 URL）')
        batch_form = QFormLayout(batch_box)
        self.batch_name = QLineEdit()
        self.batch_poster = QLineEdit()
        self.batch_dir = QLineEdit()
        self.batch_tags = QLineEdit()
        self.batch_tags.setPlaceholderText('逗号分隔，例如 国漫,连载')
        batch_btn = QPushButton('批量导入')
        batch_btn.clicked.connect(
            lambda: self.do_request('POST', '/api/episodes/batch-directory', {
                'name': self.batch_name.text().strip(),
                'poster': self.batch_poster.text().strip(),
                'directoryUrl': self.batch_dir.text().strip(),
                'tags': [x.strip() for x in self.batch_tags.text().split(',') if x.strip()],
            })
        )
        batch_form.addRow('漫剧名', self.batch_name)
        batch_form.addRow('海报 URL', self.batch_poster)
        batch_form.addRow('目录 URL', self.batch_dir)
        batch_form.addRow('标签列表', self.batch_tags)
        batch_form.addRow(batch_btn)

        update_box = QGroupBox('修改单集')
        update_form = QFormLayout(update_box)
        self.ep_update_title = QLineEdit()
        self.ep_old_no = QSpinBox()
        self.ep_old_no.setRange(1, 999999)
        self.ep_new_no = QSpinBox()
        self.ep_new_no.setRange(1, 999999)
        self.ep_new_url = QLineEdit()
        update_btn = QPushButton('修改')
        update_btn.clicked.connect(
            lambda: self.do_request('PATCH', '/api/episodes', {
                'titleName': self.ep_update_title.text().strip(),
                'episodeNo': self.ep_old_no.value(),
                'newEpisodeNo': self.ep_new_no.value(),
                'videoUrl': self.ep_new_url.text().strip(),
            })
        )
        update_form.addRow('漫剧名', self.ep_update_title)
        update_form.addRow('旧集号', self.ep_old_no)
        update_form.addRow('新集号', self.ep_new_no)
        update_form.addRow('新播放 URL', self.ep_new_url)
        update_form.addRow(update_btn)

        delete_box = QGroupBox('删除单集')
        delete_form = QFormLayout(delete_box)
        self.ep_delete_title = QLineEdit()
        self.ep_delete_no = QSpinBox()
        self.ep_delete_no.setRange(1, 999999)
        delete_btn = QPushButton('删除')
        delete_btn.clicked.connect(
            lambda: self.do_request('DELETE', '/api/episodes', {
                'titleName': self.ep_delete_title.text().strip(),
                'episodeNo': self.ep_delete_no.value(),
            })
        )
        delete_form.addRow('漫剧名', self.ep_delete_title)
        delete_form.addRow('集号', self.ep_delete_no)
        delete_form.addRow(delete_btn)

        layout.addWidget(create_box)
        layout.addWidget(batch_box)
        layout.addWidget(update_box)
        layout.addWidget(delete_box)
        layout.addStretch(1)
        return tab


def main() -> int:
    app = QApplication(sys.argv)
    app.setApplicationName('视频站管理端（Qt5）')
    app.setAttribute(Qt.AA_EnableHighDpiScaling, True)
    window = MainWindow()
    window.show()
    return app.exec_()


if __name__ == '__main__':
    sys.exit(main())
