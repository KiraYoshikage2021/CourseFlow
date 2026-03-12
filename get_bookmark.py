import sys
import json
from pathlib import Path
from pypdf import PdfReader

def extract_bookmarks(outline, reader, level=1):
    """
    递归提取书签，仅保留二级标题 (Level 2)。
    """
    bookmarks = []
    if not outline:
        return bookmarks

    for item in outline:
        if isinstance(item, list):
            # 只有当当前层级小于 2 时才继续递归
            if level < 2:
                bookmarks.extend(extract_bookmarks(item, reader, level + 1))
        else:
            # 只提取二级标题
            if level == 2:
                page_num = -1
                try:
                    if item.page is not None:
                        page_num = reader.get_page_number(item.page) + 1
                except Exception:
                    pass
                
                if page_num > 0:
                    bookmarks.append({
                        "title": item.title,
                        "level": level,
                        "page": page_num
                    })
    
    return bookmarks

def process_folder(folder_path):
    folder = Path(folder_path)
    if not folder.is_dir():
        print(f"错误: '{folder_path}' 不是一个有效的文件夹。")
        return

    pdf_files = list(folder.glob("*.pdf"))
    if not pdf_files:
        print("在该文件夹中未找到 PDF 文件。")
        return

    print(f"找到 {len(pdf_files)} 个 PDF 文件，开始处理...\n")

    for pdf_file in pdf_files:
        json_file = pdf_file.with_suffix(".json")
        print(f"正在处理: {pdf_file.name}")
        
        try:
            reader = PdfReader(pdf_file)
            
            # 🔥 新增：获取总页数
            total_pages = len(reader.pages)
            
            # 提取章节数据
            chapters = []
            if reader.outline:
                chapters = extract_bookmarks(reader.outline, reader)

            if not chapters:
                print(f"  [提示] 未找到二级标题。")
            
            # 🔥 修改：构建新的数据结构
            output_data = {
                "total_pages": total_pages,
                "chapters": chapters
            }

            # 写入 JSON
            with open(json_file, "w", encoding="utf-8") as f:
                json.dump(output_data, f, indent=4, ensure_ascii=False)
                
            print(f"  [成功] 总页数: {total_pages}, 章节数: {len(chapters)} -> {json_file.name}")

        except Exception as e:
            print(f"  [错误] 失败: {e}")

    print("\n全部完成！")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: python get_bookmark.py <文件夹路径>")
        sys.exit(1)

    input_folder = sys.argv[1]
    process_folder(input_folder)