# Методичка: вещевая служба ВС РФ

Полная учебная методичка: организация вещевой службы, вещевой/боевой склад, маскировка, учётные формы (ф. 10, 26, 37, 45 и др.), выдача, инвентаризация.

## Как открыть

- **HTML (полная версия):** откройте [`index.html`](index.html) в браузере  
  или `python3 -m http.server 8080 --directory press/veshchevaya-metodichka`
- **Word:** [`docx/Metodichka_veshchevaya_sluzhba_VS_RF.docx`](docx/Metodichka_veshchevaya_sluzhba_VS_RF.docx)
- **Архив:** [`../veshchevaya-metodichka.zip`](../veshchevaya-metodichka.zip)

## Содержание

1–15. Базовые главы (служба, склад, маскировка, ф. 10, учёт, выдача, чек-листы, источники)  
16. Режим склада (паспорт, журнал Т/φ, картотека)  
17. Арматурная карточка и ростовка  
18. Клеймение, подгонка, подменный фонд  
19. **Сроки носки** (таблицы + климатические поправки)  
20. **Списание** III категории и расходников  
21. Приём-сдача дел  
22. Шпаргалка «какой документ» + типовые ошибки  

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
| `images/08_sroki_noski.png` | Сроки носки |
| `images/09_spisanie.png` | Схема списания |
| `images/10_armaturnaya_kartochka.png` | Арматурная карточка |
| `images/11_kakoy_dokument.png` | Какой документ на операцию |
| `images/12_rezhim_sklada.png` | Режим склада |

## Пересборка схем / Word

```bash
python3 press/veshchevaya-metodichka/build_schemes.py
python3 press/veshchevaya-metodichka/build_supplement.py
python3 press/veshchevaya-metodichka/build_docx.py
```

## Важно

Учебный материал по открытым источникам. Не заменяет НПА и локальные документы части. Документы ДСП не раскрываются.
