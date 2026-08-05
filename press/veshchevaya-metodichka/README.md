# Методичка: вещевая служба ВС РФ

Полная учебная методичка: организация вещевой службы, вещевой/боевой склад, маскировка, учётные формы (ф. 10, 26, 37, 45 и др.), выдача, инвентаризация.

## Как открыть

- **HTML (полная версия):** откройте [`index.html`](index.html) в браузере  
  или `python3 -m http.server 8080 --directory press/veshchevaya-metodichka`
- **Word:** [`docx/Metodichka_veshchevaya_sluzhba_VS_RF.docx`](docx/Metodichka_veshchevaya_sluzhba_VS_RF.docx)
- **Архив:** [`../veshchevaya-metodichka.zip`](../veshchevaya-metodichka.zip)

## Содержание

1. Введение  
2. Правовая база  
3. Организация службы в части  
4. Виды имущества и категории  
5. Нормы, сроки, ростовка  
6. Организация склада (схема)  
7. Маскировка и полевое хранение  
8. Система учёта  
9. Форма № 10 (акт закладки/обновления)  
10. Книги ф. 25–27, 37, 45, ярлык 64, 0504042, аттестат 21, акт 11  
11. Документооборот прибытия/убытия  
12. Выдача, компенсации, БПО  
13. Инвентаризация и ответственность  
14. Чек-листы  
15. Источники  

## Картинки

| Файл | Содержание |
|---|---|
| `images/01_skhema_sklada.png` | Схема вещевого склада |
| `images/02_maskirovka_sklada.png` | Маскировка полевого склада |
| `images/03_karta_form.png` | Карта учётных форм |
| `images/04_forma_10_maket.png` | Макет формы № 10 |
| `images/05_forma_26_vedenie.png` | Как вести ф. 26 |
| `images/06_dokumentooborot.png` | Документооборот |
| `images/07_chek_list_veschevaya.png` | Чек-лист |

## Пересборка схем / Word

```bash
python3 press/veshchevaya-metodichka/build_schemes.py
python3 press/veshchevaya-metodichka/build_docx.py
```

## Важно

Учебный материал по открытым источникам. Не заменяет НПА и локальные документы части. Документы ДСП не раскрываются.
