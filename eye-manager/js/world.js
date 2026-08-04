/* EYE World — real leagues, clubs, star players (compact roster data) */
window.EYE_WORLD = (() => {
  /**
   * Star format: [name, pos, age, ovr, nationCode]
   * Squad is completed by generator around club.rep.
   */
  const NATIONS = {
    ARG:'Аргентина', BRA:'Бразилия', ENG:'Англия', ESP:'Испания', FRA:'Франция',
    GER:'Германия', ITA:'Италия', POR:'Португалия', NED:'Нидерланды', BEL:'Бельгия',
    CRO:'Хорватия', URU:'Уругвай', COL:'Колумбия', MEX:'Мексика', USA:'США',
    JPN:'Япония', KOR:'Корея', TUR:'Турция', POL:'Польша', RUS:'Россия',
    NOR:'Норвегия', SWE:'Швеция', DEN:'Дания', SUI:'Швейцария', AUT:'Австрия',
    SCO:'Шотландия', WAL:'Уэльс', IRL:'Ирландия', CZE:'Чехия', SRB:'Сербия',
    UKR:'Украина', EGY:'Египет', SEN:'Сенегал', NGA:'Нигерия', GHA:'Гана',
    CIV:'Кот-д’Ивуар', CMR:'Камерун', MAR:'Марокко', ALG:'Алжир', CHI:'Чили',
    ECU:'Эквадор', PAR:'Парагвай', CAN:'Канада', AUS:'Австралия', GEO:'Грузия',
    SVK:'Словакия', HUN:'Венгрия', ROU:'Румыния', GRE:'Греция', ALB:'Албания'
  };

  const LEAGUES = [
    { id:'epl', name:'Premier League', country:'Англия', tier:1, prize:45e6, currency:'€', short:'EPL' },
    { id:'laliga', name:'La Liga', country:'Испания', tier:1, prize:38e6, currency:'€', short:'LAL' },
    { id:'seriea', name:'Serie A', country:'Италия', tier:1, prize:32e6, currency:'€', short:'SEA' },
    { id:'bundesliga', name:'Bundesliga', country:'Германия', tier:1, prize:30e6, currency:'€', short:'BUN' },
    { id:'ligue1', name:'Ligue 1', country:'Франция', tier:1, prize:28e6, currency:'€', short:'LI1' },
    { id:'rpl', name:'РПЛ', country:'Россия', tier:1, prize:12e6, currency:'₽', short:'RPL' }
  ];

  const CLUBS = [
    // ——— Premier League ———
    { id:'mci', name:'Manchester City', short:'MCI', leagueId:'epl', color:'#6CABDD', rep:91, budget:180e6, fans:55000, stadium:'Etihad', formation:'4-3-3',
      stars:[
        ['Erling Haaland','ST',24,91,'NOR'],['Kevin De Bruyne','CAM',33,88,'BEL'],['Rodri','CDM',28,90,'ESP'],
        ['Phil Foden','LW',24,88,'ENG'],['Bernardo Silva','RW',30,87,'POR'],['Ruben Dias','CB',27,88,'POR'],
        ['Ederson','GK',31,88,'BRA'],['Josko Gvardiol','LB',23,85,'CRO'],['Kyle Walker','RB',34,82,'ENG'],
        ['Jeremy Doku','LW',22,83,'BEL'],['Mateo Kovacic','CM',30,83,'CRO'],['John Stones','CB',30,84,'ENG']
      ]},
    { id:'liv', name:'Liverpool', short:'LIV', leagueId:'epl', color:'#C8102E', rep:90, budget:140e6, fans:61000, stadium:'Anfield', formation:'4-3-3',
      stars:[
        ['Mohamed Salah','RW',32,89,'EGY'],['Virgil van Dijk','CB',33,88,'NED'],['Alisson','GK',32,89,'BRA'],
        ['Alexis Mac Allister','CM',25,85,'ARG'],['Dominik Szoboszlai','CM',24,84,'HUN'],['Luis Diaz','LW',27,85,'COL'],
        ['Darwin Nunez','ST',25,83,'URU'],['Trent Alexander-Arnold','RB',26,86,'ENG'],['Andrew Robertson','LB',30,84,'SCO'],
        ['Ryan Gravenberch','CDM',22,82,'NED'],['Cody Gakpo','LW',25,83,'NED'],['Ibrahima Konate','CB',25,84,'FRA']
      ]},
    { id:'ars', name:'Arsenal', short:'ARS', leagueId:'epl', color:'#EF0107', rep:89, budget:130e6, fans:60000, stadium:'Emirates', formation:'4-3-3',
      stars:[
        ['Bukayo Saka','RW',23,87,'ENG'],['Martin Odegaard','CAM',25,87,'NOR'],['Declan Rice','CDM',25,87,'ENG'],
        ['William Saliba','CB',23,86,'FRA'],['Gabriel','CB',26,85,'BRA'],['Kai Havertz','ST',25,83,'GER'],
        ['David Raya','GK',29,84,'ESP'],['Gabriel Martinelli','LW',23,84,'BRA'],['Ben White','RB',26,83,'ENG'],
        ['Oleksandr Zinchenko','LB',27,81,'UKR'],['Leandro Trossard','LW',29,82,'BEL'],['Thomas Partey','CDM',31,81,'GHA']
      ]},
    { id:'che', name:'Chelsea', short:'CHE', leagueId:'epl', color:'#034694', rep:86, budget:200e6, fans:40000, stadium:'Stamford Bridge', formation:'4-2-3-1',
      stars:[
        ['Cole Palmer','CAM',22,86,'ENG'],['Enzo Fernandez','CM',23,84,'ARG'],['Moises Caicedo','CDM',22,84,'ECU'],
        ['Nicolas Jackson','ST',23,81,'SEN'],['Reece James','RB',24,84,'ENG'],['Levi Colwill','CB',21,82,'ENG'],
        ['Robert Sanchez','GK',26,80,'ESP'],['Noni Madueke','RW',22,80,'ENG'],['Christopher Nkunku','ST',26,83,'FRA'],
        ['Malo Gusto','RB',21,80,'FRA'],['Conor Gallagher','CM',24,81,'ENG'],['Wesley Fofana','CB',23,81,'FRA']
      ]},
    { id:'tot', name:'Tottenham', short:'TOT', leagueId:'epl', color:'#132257', rep:84, budget:95e6, fans:62000, stadium:'Tottenham Hotspur Stadium', formation:'4-3-3',
      stars:[
        ['Son Heung-min','LW',32,86,'KOR'],['James Maddison','CAM',27,84,'ENG'],['Cristian Romero','CB',26,85,'ARG'],
        ['Destiny Udogie','LB',21,81,'ITA'],['Guglielmo Vicario','GK',27,82,'ITA'],['Dejan Kulusevski','RW',24,83,'SWE'],
        ['Richarlison','ST',27,81,'BRA'],['Pedro Porro','RB',24,82,'ESP'],['Yves Bissouma','CDM',27,81,'MLI'],
        ['Micky van de Ven','CB',23,83,'NED'],['Brennan Johnson','RW',23,80,'WAL'],['Pape Matar Sarr','CM',21,79,'SEN']
      ]},
    { id:'mun', name:'Manchester United', short:'MUN', leagueId:'epl', color:'#DA291C', rep:85, budget:120e6, fans:74000, stadium:'Old Trafford', formation:'4-2-3-1',
      stars:[
        ['Bruno Fernandes','CAM',29,87,'POR'],['Marcus Rashford','LW',26,83,'ENG'],['Kobbie Mainoo','CM',19,81,'ENG'],
        ['Lisandro Martinez','CB',26,84,'ARG'],['Andre Onana','GK',28,83,'CMR'],['Rasmus Hojlund','ST',21,80,'DEN'],
        ['Alejandro Garnacho','LW',20,81,'ARG'],['Diogo Dalot','RB',25,81,'POR'],['Casemiro','CDM',32,82,'BRA'],
        ['Harry Maguire','CB',31,80,'ENG'],['Luke Shaw','LB',29,81,'ENG'],['Amad Diallo','RW',22,79,'CIV']
      ]},
    { id:'new', name:'Newcastle', short:'NEW', leagueId:'epl', color:'#241F20', rep:83, budget:110e6, fans:52000, stadium:'St James\' Park', formation:'4-3-3',
      stars:[
        ['Alexander Isak','ST',24,86,'SWE'],['Bruno Guimaraes','CM',26,85,'BRA'],['Anthony Gordon','LW',23,83,'ENG'],
        ['Sven Botman','CB',24,83,'NED'],['Nick Pope','GK',32,82,'ENG'],['Kieran Trippier','RB',33,82,'ENG'],
        ['Joelinton','CM',27,82,'BRA'],['Sean Longstaff','CM',26,78,'ENG'],['Dan Burn','CB',32,79,'ENG'],
        ['Harvey Barnes','LW',26,80,'ENG'],['Jacob Murphy','RW',29,78,'ENG'],['Sandro Tonali','CDM',24,83,'ITA']
      ]},
    { id:'avl', name:'Aston Villa', short:'AVL', leagueId:'epl', color:'#670E36', rep:82, budget:85e6, fans:42000, stadium:'Villa Park', formation:'4-2-3-1',
      stars:[
        ['Ollie Watkins','ST',28,85,'ENG'],['Douglas Luiz','CM',26,83,'BRA'],['Emiliano Martinez','GK',31,87,'ARG'],
        ['Moussa Diaby','RW',25,82,'FRA'],['Pau Torres','CB',27,83,'ESP'],['John McGinn','CM',29,82,'SCO'],
        ['Leon Bailey','LW',26,81,'JAM'],['Ezri Konsa','CB',26,81,'ENG'],['Lucas Digne','LB',31,79,'FRA'],
        ['Youri Tielemans','CM',27,81,'BEL'],['Matty Cash','RB',26,79,'POL'],['Boubacar Kamara','CDM',24,81,'FRA']
      ]},
    { id:'bha', name:'Brighton', short:'BHA', leagueId:'epl', color:'#0057B8', rep:79, budget:70e6, fans:31000, stadium:'Amex', formation:'4-2-3-1',
      stars:[
        ['Kaoru Mitoma','LW',27,82,'JPN'],['Pascal Gross','CAM',33,80,'GER'],['Lewis Dunk','CB',32,81,'ENG'],
        ['Jason Steele','GK',33,76,'ENG'],['Joao Pedro','ST',22,81,'BRA'],['Facundo Buonanotte','CAM',19,76,'ARG'],
        ['Pervis Estupinan','LB',26,81,'ECU'],['Adam Webster','CB',29,78,'ENG'],['Billy Gilmour','CM',23,78,'SCO'],
        ['Simon Adingra','RW',22,79,'CIV'],['Carlos Baleba','CDM',20,77,'CMR'],['Tariq Lamptey','RB',23,77,'GHA']
      ]},
    { id:'whu', name:'West Ham', short:'WHU', leagueId:'epl', color:'#7A263A', rep:78, budget:65e6, fans:62000, stadium:'London Stadium', formation:'4-2-3-1',
      stars:[
        ['Jarrod Bowen','RW',27,83,'ENG'],['Lucas Paqueta','CAM',26,83,'BRA'],['Mohammed Kudus','RW',23,82,'GHA'],
        ['Alphonse Areola','GK',31,80,'FRA'],['Tomas Soucek','CDM',29,80,'CZE'],['Nayef Aguerd','CB',28,80,'MAR'],
        ['Vladimir Coufal','RB',31,78,'CZE'],['Emerson Palmieri','LB',29,77,'ITA'],['Michail Antonio','ST',34,77,'JAM'],
        ['Edson Alvarez','CDM',26,81,'MEX'],['James Ward-Prowse','CM',29,80,'ENG'],['Konstantinos Mavropanos','CB',26,78,'GRE']
      ]},
    { id:'ful', name:'Fulham', short:'FUL', leagueId:'epl', color:'#000000', rep:76, budget:55e6, fans:25000, stadium:'Craven Cottage', formation:'4-2-3-1',
      stars:[
        ['Andreas Pereira','CAM',28,79,'BRA'],['Alex Iwobi','LW',28,79,'NGA'],['Bernd Leno','GK',32,81,'GER'],
        ['Joao Palhinha','CDM',28,84,'POR'],['Harry Wilson','RW',27,78,'WAL'],['Raul Jimenez','ST',33,77,'MEX'],
        ['Antonee Robinson','LB',26,80,'USA'],['Timothy Castagne','RB',28,78,'BEL'],['Calvin Bassey','CB',24,78,'NGA'],
        ['Tom Cairney','CM',33,76,'SCO'],['Rodrigo Muniz','ST',23,77,'BRA'],['Issa Diop','CB',27,77,'FRA']
      ]},
    { id:'cry', name:'Crystal Palace', short:'CRY', leagueId:'epl', color:'#1B458F', rep:75, budget:50e6, fans:25000, stadium:'Selhurst Park', formation:'4-3-3',
      stars:[
        ['Eberechi Eze','CAM',26,83,'ENG'],['Michael Olise','RW',22,82,'FRA'],['Marc Guehi','CB',23,81,'ENG'],
        ['Sam Johnstone','GK',31,78,'ENG'],['Jean-Philippe Mateta','ST',27,79,'FRA'],['Tyrick Mitchell','LB',24,78,'ENG'],
        ['Joachim Andersen','CB',28,80,'DEN'],['Jefferson Lerma','CDM',29,78,'COL'],['Jordan Ayew','ST',32,76,'GHA'],
        ['Will Hughes','CM',29,76,'ENG'],['Daniel Munoz','RB',28,78,'COL'],['Adam Wharton','CM',20,78,'ENG']
      ]},

    // ——— La Liga ———
    { id:'rma', name:'Real Madrid', short:'RMA', leagueId:'laliga', color:'#FEBE10', rep:93, budget:200e6, fans:81000, stadium:'Santiago Bernabeu', formation:'4-3-3',
      stars:[
        ['Vinicius Junior','LW',24,90,'BRA'],['Jude Bellingham','CM',21,90,'ENG'],['Kylian Mbappe','ST',25,91,'FRA'],
        ['Federico Valverde','CM',26,88,'URU'],['Thibaut Courtois','GK',32,89,'BEL'],['Antonio Rudiger','CB',31,87,'GER'],
        ['Rodrygo','RW',23,86,'BRA'],['Eduardo Camavinga','CDM',21,84,'FRA'],['Aurelien Tchouameni','CDM',24,85,'FRA'],
        ['Dani Carvajal','RB',32,85,'ESP'],['David Alaba','CB',32,84,'AUT'],['Ferland Mendy','LB',29,82,'FRA']
      ]},
    { id:'bar', name:'Barcelona', short:'BAR', leagueId:'laliga', color:'#A50044', rep:91, budget:100e6, fans:99000, stadium:'Spotify Camp Nou', formation:'4-3-3',
      stars:[
        ['Robert Lewandowski','ST',35,88,'POL'],['Pedri','CM',21,86,'ESP'],['Gavi','CM',20,84,'ESP'],
        ['Frenkie de Jong','CM',27,86,'NED'],['Marc-Andre ter Stegen','GK',32,88,'GER'],['Ronald Araujo','CB',25,86,'URU'],
        ['Lamine Yamal','RW',17,84,'ESP'],['Raphinha','LW',27,84,'BRA'],['Jules Kounde','CB',25,85,'FRA'],
        ['Alejandro Balde','LB',20,82,'ESP'],['Ilkay Gundogan','CM',33,84,'GER'],['Joao Cancelo','RB',30,84,'POR']
      ]},
    { id:'atm', name:'Atletico Madrid', short:'ATM', leagueId:'laliga', color:'#CB3524', rep:87, budget:90e6, fans:68000, stadium:'Civitas Metropolitano', formation:'3-5-2',
      stars:[
        ['Antoine Griezmann','ST',33,86,'FRA'],['Jan Oblak','GK',31,88,'SVN'],['Jose Maria Gimenez','CB',29,84,'URU'],
        ['Rodrigo De Paul','CM',30,83,'ARG'],['Marcos Llorente','CM',29,83,'ESP'],['Alvaro Morata','ST',31,82,'ESP'],
        ['Samuel Lino','LW',24,81,'BRA'],['Nahuel Molina','RB',26,81,'ARG'],['Koke','CM',32,82,'ESP'],
        ['Mario Hermoso','CB',29,80,'ESP'],['Angel Correa','RW',29,81,'ARG'],['Thomas Lemar','CAM',28,80,'FRA']
      ]},
    { id:'sev', name:'Sevilla', short:'SEV', leagueId:'laliga', color:'#F43333', rep:79, budget:55e6, fans:43000, stadium:'Ramon Sanchez-Pizjuan', formation:'4-2-3-1',
      stars:[
        ['Youssef En-Nesyri','ST',27,81,'MAR'],['Ivan Rakitic','CM',36,78,'CRO'],['Nemanja Gudelj','CDM',32,79,'SRB'],
        ['Orjan Nyland','GK',33,75,'NOR'],['Jesus Navas','RB',38,76,'ESP'],['Lucas Ocampos','RW',30,80,'ARG'],
        ['Sergio Ramos','CB',38,79,'ESP'],['Djibril Sow','CM',27,78,'SUI'],['Marcos Acuna','LB',32,80,'ARG'],
        ['Dodi Lukebakio','RW',26,78,'BEL'],['Loic Bade','CB',24,79,'FRA'],['Suso','CAM',30,78,'ESP']
      ]},
    { id:'rso', name:'Real Sociedad', short:'RSO', leagueId:'laliga', color:'#0067B1', rep:80, budget:60e6, fans:39000, stadium:'Reale Arena', formation:'4-3-3',
      stars:[
        ['Mikel Oyarzabal','ST',27,83,'ESP'],['Takefusa Kubo','RW',23,82,'JPN'],['Martin Zubimendi','CDM',25,83,'ESP'],
        ['Alex Remiro','GK',29,81,'ESP'],['Robin Le Normand','CB',27,83,'ESP'],['Mikel Merino','CM',28,82,'ESP'],
        ['Ander Barrenetxea','LW',22,79,'ESP'],['Aritz Elustondo','CB',30,78,'ESP'],['Aihen Munoz','LB',26,77,'ESP'],
        ['Brais Mendez','CAM',27,80,'ESP'],['Umar Sadiq','ST',27,78,'NGA'],['Hamari Traore','RB',32,77,'MLI']
      ]},
    { id:'vil', name:'Villarreal', short:'VIL', leagueId:'laliga', color:'#FFE014', rep:80, budget:58e6, fans:23000, stadium:'La Ceramica', formation:'4-4-2',
      stars:[
        ['Alexander Sorloth','ST',28,82,'NOR'],['Gerard Moreno','ST',32,82,'ESP'],['Dani Parejo','CM',35,80,'ESP'],
        ['Filip Jorgensen','GK',22,78,'DEN'],['Pau Torres','CB',27,83,'ESP'],['Yeremy Pino','RW',21,80,'ESP'],
        ['Alex Baena','CAM',22,81,'ESP'],['Alfonso Pedraza','LB',28,78,'ESP'],['Raul Albiol','CB',38,76,'ESP'],
        ['Santi Comesaña','CM',27,77,'ESP'],['Juan Foyth','RB',26,79,'ARG'],['Jose Luis Morales','LW',36,76,'ESP']
      ]},
    { id:'ath', name:'Athletic Bilbao', short:'ATH', leagueId:'laliga', color:'#EE2523', rep:81, budget:50e6, fans:53000, stadium:'San Mames', formation:'4-2-3-1',
      stars:[
        ['Nico Williams','LW',21,84,'ESP'],['Inaki Williams','RW',30,82,'GHA'],['Oihan Sancet','CAM',24,82,'ESP'],
        ['Unai Simon','GK',27,84,'ESP'],['Yeray Alvarez','CB',29,80,'ESP'],['Inigo Martinez','CB',33,82,'ESP'],
        ['Gorka Guruzeta','ST',27,79,'ESP'],['Mikel Vesga','CDM',31,77,'ESP'],['Yuri Berchiche','LB',34,78,'ESP'],
        ['Oscar de Marcos','RB',35,77,'ESP'],['Unai Gomez','CM',21,75,'ESP'],['Aitor Paredes','CB',24,77,'ESP']
      ]},
    { id:'bet', name:'Real Betis', short:'BET', leagueId:'laliga', color:'#0BB363', rep:78, budget:48e6, fans:60000, stadium:'Benito Villamarin', formation:'4-2-3-1',
      stars:[
        ['Isco','CAM',32,82,'ESP'],['Nabil Fekir','CAM',31,81,'FRA'],['Ayoze Perez','ST',30,79,'ESP'],
        ['Rui Silva','GK',30,79,'POR'],['Guido Rodriguez','CDM',30,81,'ARG'],['Marc Bartra','CB',33,78,'ESP'],
        ['Juan Miranda','LB',24,77,'ESP'],['Hector Bellerin','RB',29,77,'ESP'],['William Carvalho','CDM',32,78,'POR'],
        ['Abde Ezzalzouli','LW',22,78,'MAR'],['Willian Jose','ST',32,77,'BRA'],['Rodri Sanchez','RW',24,76,'ESP']
      ]},
    { id:'gir', name:'Girona', short:'GIR', leagueId:'laliga', color:'#CD2534', rep:77, budget:40e6, fans:14000, stadium:'Montilivi', formation:'3-4-3',
      stars:[
        ['Artem Dovbyk','ST',27,82,'UKR'],['Viktor Tsygankov','RW',26,82,'UKR'],['Aleix Garcia','CM',26,81,'ESP'],
        ['Paulo Gazzaniga','GK',32,79,'ARG'],['Eric Garcia','CB',23,79,'ESP'],['Yangel Herrera','CM',26,79,'VEN'],
        ['Miguel Gutierrez','LB',22,78,'ESP'],['Daley Blind','CB',34,78,'NED'],['Portu','RW',32,76,'ESP'],
        ['Cristhian Stuani','ST',37,76,'URU'],['Ivan Martin','CAM',25,77,'ESP'],['Arnau Martinez','RB',21,78,'ESP']
      ]},
    { id:'val', name:'Valencia', short:'VAL', leagueId:'laliga', color:'#EE3524', rep:76, budget:35e6, fans:49000, stadium:'Mestalla', formation:'4-4-2',
      stars:[
        ['Hugo Duro','ST',24,79,'ESP'],['Jose Gaya','LB',29,81,'ESP'],['Giorgi Mamardashvili','GK',23,83,'GEO'],
        ['Javi Guerra','CM',21,78,'ESP'],['Mouctar Diakhaby','CB',27,78,'FRA'],['Thierry Correia','RB',25,77,'POR'],
        ['Andre Almeida','CM',24,77,'POR'],['Diego Lopez','LW',22,76,'ESP'],['Pepelu','CDM',25,79,'ESP'],
        ['Roman Yaremchuk','ST',28,76,'UKR'],['Cenk Ozkacar','CB',23,76,'TUR'],['Fran Perez','RW',21,74,'ESP']
      ]},

    // ——— Serie A ———
    { id:'int', name:'Inter', short:'INT', leagueId:'seriea', color:'#010E80', rep:89, budget:95e6, fans:80000, stadium:'San Siro', formation:'3-5-2',
      stars:[
        ['Lautaro Martinez','ST',26,88,'ARG'],['Marcus Thuram','ST',26,84,'FRA'],['Nicolo Barella','CM',27,86,'ITA'],
        ['Yann Sommer','GK',35,85,'SUI'],['Alessandro Bastoni','CB',25,86,'ITA'],['Hakan Calhanoglu','CDM',30,85,'TUR'],
        ['Federico Dimarco','LWB',26,84,'ITA'],['Denzel Dumfries','RWB',28,82,'NED'],['Francesco Acerbi','CB',36,82,'ITA'],
        ['Henrikh Mkhitaryan','CM',35,81,'ARM'],['Benjamin Pavard','CB',28,83,'FRA'],['Davide Frattesi','CM',24,81,'ITA']
      ]},
    { id:'mil', name:'Milan', short:'MIL', leagueId:'seriea', color:'#FB090B', rep:87, budget:90e6, fans:80000, stadium:'San Siro', formation:'4-2-3-1',
      stars:[
        ['Rafael Leao','LW',25,86,'POR'],['Christian Pulisic','RW',25,83,'USA'],['Olivier Giroud','ST',37,81,'FRA'],
        ['Mike Maignan','GK',29,87,'FRA'],['Fikayo Tomori','CB',26,83,'ENG'],['Theo Hernandez','LB',26,86,'FRA'],
        ['Tijjani Reijnders','CM',25,83,'NED'],['Yunús Musah','CM',21,78,'USA'],['Davide Calabria','RB',27,79,'ITA'],
        ['Malick Thiaw','CB',22,79,'GER'],['Ruben Loftus-Cheek','CM',28,80,'ENG'],['Samuel Chukwueze','RW',25,80,'NGA']
      ]},
    { id:'juv', name:'Juventus', short:'JUV', leagueId:'seriea', color:'#000000', rep:86, budget:100e6, fans:41000, stadium:'Allianz Stadium', formation:'3-5-2',
      stars:[
        ['Dusan Vlahovic','ST',24,84,'SRB'],['Federico Chiesa','RW',26,84,'ITA'],['Manuel Locatelli','CDM',26,83,'ITA'],
        ['Wojciech Szczesny','GK',34,84,'POL'],['Bremer','CB',27,85,'BRA'],['Weston McKennie','CM',25,80,'USA'],
        ['Adrien Rabiot','CM',29,83,'FRA'],['Danilo','RB',32,80,'BRA'],['Andrea Cambiaso','LB',24,79,'ITA'],
        ['Arkadiusz Milik','ST',30,79,'POL'],['Fabio Miretti','CM',20,76,'ITA'],['Gleison Bremer','CB',27,85,'BRA']
      ]},
    { id:'nap', name:'Napoli', short:'NAP', leagueId:'seriea', color:'#12A0D7', rep:85, budget:85e6, fans:55000, stadium:'Diego Armando Maradona', formation:'4-3-3',
      stars:[
        ['Victor Osimhen','ST',25,88,'NGA'],['Khvicha Kvaratskhelia','LW',23,86,'GEO'],['Stanislav Lobotka','CDM',29,84,'SVK'],
        ['Alex Meret','GK',27,82,'ITA'],['Amir Rrahmani','CB',30,81,'KOS'],['Giovanni Di Lorenzo','RB',30,83,'ITA'],
        ['Piotr Zielinski','CM',30,82,'POL'],['Matteo Politano','RW',30,81,'ITA'],['Mario Rui','LB',33,78,'POR'],
        ['Andre-Frank Zambo Anguissa','CM',28,83,'CMR'],['Leo Ostigard','CB',24,78,'NOR'],['Giacomo Raspadori','ST',24,80,'ITA']
      ]},
    { id:'rom', name:'Roma', short:'ROM', leagueId:'seriea', color:'#8E1F2F', rep:82, budget:70e6, fans:70000, stadium:'Olimpico', formation:'3-4-2-1',
      stars:[
        ['Paulo Dybala','CAM',30,85,'ARG'],['Romelu Lukaku','ST',31,84,'BEL'],['Lorenzo Pellegrini','CAM',28,83,'ITA'],
        ['Rui Patricio','GK',36,80,'POR'],['Gianluca Mancini','CB',28,81,'ITA'],['Chris Smalling','CB',34,80,'ENG'],
        ['Nicola Zalewski','LWB',22,78,'POL'],['Bryan Cristante','CDM',29,80,'ITA'],['Rick Karsdorp','RWB',29,77,'NED'],
        ['Stephan El Shaarawy','LW',31,79,'ITA'],['Leandro Paredes','CDM',30,80,'ARG'],['Tammy Abraham','ST',26,80,'ENG']
      ]},
    { id:'laz', name:'Lazio', short:'LAZ', leagueId:'seriea', color:'#87D8F7', rep:80, budget:55e6, fans:70000, stadium:'Olimpico', formation:'4-3-3',
      stars:[
        ['Ciro Immobile','ST',34,83,'ITA'],['Luis Alberto','CAM',31,83,'ESP'],['Sergej Milinkovic-Savic','CM',29,85,'SRB'],
        ['Ivan Provedel','GK',30,81,'ITA'],['Alessio Romagnoli','CB',29,81,'ITA'],['Adam Marusic','RB',31,78,'MNE'],
        ['Mattia Zaccagni','LW',28,81,'ITA'],['Pedro','RW',36,77,'ESP'],['Danilo Cataldi','CDM',29,78,'ITA'],
        ['Elseid Hysaj','LB',30,77,'ALB'],['Felipe Anderson','RW',31,79,'BRA'],['Patric','CB',31,77,'ESP']
      ]},
    { id:'ata', name:'Atalanta', short:'ATA', leagueId:'seriea', color:'#1E71B8', rep:83, budget:65e6, fans:21000, stadium:'Gewiss Stadium', formation:'3-4-2-1',
      stars:[
        ['Gianluca Scamacca','ST',25,81,'ITA'],['Teun Koopmeiners','CM',26,84,'NED'],['Ademola Lookman','LW',26,83,'NGA'],
        ['Juan Musso','GK',30,80,'ARG'],['Giorgio Scalvini','CB',20,80,'ITA'],['Berat Djimsiti','CB',31,80,'ALB'],
        ['Davide Zappacosta','RWB',32,78,'ITA'],['Martens de Roon','CDM',33,79,'NED'],['Charles De Ketelaere','CAM',23,80,'BEL'],
        ['Mario Pasalic','CM',29,79,'CRO'],['Sead Kolasinac','LWB',31,77,'BIH'],['Mateo Retegui','ST',25,80,'ITA']
      ]},
    { id:'fio', name:'Fiorentina', short:'FIO', leagueId:'seriea', color:'#7B548F', rep:78, budget:45e6, fans:43000, stadium:'Artemio Franchi', formation:'4-2-3-1',
      stars:[
        ['Nicolas Gonzalez','RW',26,81,'ARG'],['Giacomo Bonaventura','CM',34,79,'ITA'],['Lucas Beltran','ST',23,78,'ARG'],
        ['Pietro Terracciano','GK',34,78,'ITA'],['Nikola Milenkovic','CB',26,81,'SRB'],['Cristiano Biraghi','LB',31,78,'ITA'],
        ['Sofyan Amrabat','CDM',27,81,'MAR'],['Arthur','CM',27,78,'BRA'],['Jonathan Ikone','RW',26,77,'FRA'],
        ['Lucas Martinez Quarta','CB',28,78,'ARG'],['Rolando Mandragora','CM',27,77,'ITA'],['Andrea Belotti','ST',30,78,'ITA']
      ]},
    { id:'bol', name:'Bologna', short:'BOL', leagueId:'seriea', color:'#1A2F5B', rep:77, budget:40e6, fans:32000, stadium:'Renato Dall\'Ara', formation:'4-2-3-1',
      stars:[
        ['Joshua Zirkzee','ST',23,80,'NED'],['Riccardo Orsolini','RW',27,80,'ITA'],['Lewis Ferguson','CM',24,79,'SCO'],
        ['Lukasz Skorupski','GK',33,78,'POL'],['Sam Beukema','CB',25,78,'NED'],['Riccardo Calafiori','LB',21,79,'ITA'],
        ['Remo Freuler','CDM',32,79,'SUI'],['Nikola Moro','CM',26,76,'CRO'],['Stefan Posch','RB',27,77,'AUT'],
        ['Alexis Saelemaekers','RW',24,78,'BEL'],['Dan Ndoye','LW',23,77,'SUI'],['Giovanni Fabbian','CM',21,75,'ITA']
      ]},
    { id:'tor', name:'Torino', short:'TOR', leagueId:'seriea', color:'#8B0000', rep:75, budget:35e6, fans:28000, stadium:'Olimpico Grande Torino', formation:'3-4-2-1',
      stars:[
        ['Duvan Zapata','ST',33,80,'COL'],['Antonio Sanabria','ST',28,78,'PAR'],['Samuele Ricci','CM',22,78,'ITA'],
        ['Vanja Milinkovic-Savic','GK',27,79,'SRB'],['Bremer','CB',27,85,'BRA'],['Ricardo Rodriguez','LB',31,77,'SUI'],
        ['Ivan Ilic','CM',23,77,'SRB'],['Raoul Bellanova','RWB',24,77,'ITA'],['Adam Masina','LWB',30,75,'MAR'],
        ['Nikola Vlasic','CAM',26,78,'CRO'],['Perr Schuurs','CB',24,77,'NED'],['Karol Linetty','CM',29,76,'POL']
      ]},

    // ——— Bundesliga ———
    { id:'bay', name:'Bayern Munich', short:'BAY', leagueId:'bundesliga', color:'#DC052D', rep:92, budget:160e6, fans:75000, stadium:'Allianz Arena', formation:'4-2-3-1',
      stars:[
        ['Harry Kane','ST',31,90,'ENG'],['Jamal Musiala','CAM',21,87,'GER'],['Leroy Sane','RW',28,85,'GER'],
        ['Manuel Neuer','GK',38,86,'GER'],['Kim Min-jae','CB',27,85,'KOR'],['Joshua Kimmich','CDM',29,87,'GER'],
        ['Alphonso Davies','LB',23,85,'CAN'],['Serge Gnabry','LW',28,83,'GER'],['Leon Goretzka','CM',29,84,'GER'],
        ['Dayot Upamecano','CB',25,84,'FRA'],['Noussair Mazraoui','RB',26,81,'MAR'],['Thomas Muller','CAM',34,82,'GER']
      ]},
    { id:'bvb', name:'Borussia Dortmund', short:'BVB', leagueId:'bundesliga', color:'#FDE100', rep:86, budget:100e6, fans:81000, stadium:'Signal Iduna Park', formation:'4-3-3',
      stars:[
        ['Julian Brandt','CAM',28,84,'GER'],['Niclas Fullkrug','ST',31,82,'GER'],['Karim Adeyemi','LW',22,81,'GER'],
        ['Gregor Kobel','GK',26,86,'SUI'],['Mats Hummels','CB',35,82,'GER'],['Nico Schlotterbeck','CB',24,83,'GER'],
        ['Marcel Sabitzer','CM',30,82,'AUT'],['Julian Ryerson','RB',26,79,'NOR'],['Ian Maatsen','LB',22,78,'NED'],
        ['Donyell Malen','RW',25,81,'NED'],['Emile Smith Rowe','CAM',23,79,'ENG'],['Felix Nmecha','CM',23,78,'GER']
      ]},
    { id:'rbl', name:'RB Leipzig', short:'RBL', leagueId:'bundesliga', color:'#DD0741', rep:84, budget:90e6, fans:47000, stadium:'Red Bull Arena', formation:'4-2-2-2',
      stars:[
        ['Lois Openda','ST',24,84,'BEL'],['Xavi Simons','CAM',21,84,'NED'],['Dani Olmo','CAM',26,84,'ESP'],
        ['Peter Gulacsi','GK',34,81,'HUN'],['Willi Orban','CB',31,81,'HUN'],['David Raum','LB',26,81,'GER'],
        ['Benjamin Henrichs','RB',27,79,'GER'],['Amadou Haidara','CM',26,79,'MLI'],['Xaver Schlager','CDM',26,81,'AUT'],
        ['Benjamin Sesko','ST',21,80,'SVN'],['Christoph Baumgartner','CAM',24,80,'AUT'],['Castello Lukeba','CB',21,80,'FRA']
      ]},
    { id:'bmg', name:'Gladbach', short:'BMG', leagueId:'bundesliga', color:'#000000', rep:76, budget:40e6, fans:54000, stadium:'Borussia-Park', formation:'4-2-3-1',
      stars:[
        ['Alassane Plea','ST',31,79,'FRA'],['Florian Neuhaus','CM',27,78,'GER'],['Jonas Hofmann','CAM',31,81,'GER'],
        ['Jonas Omlin','GK',30,78,'SUI'],['Nico Elvedi','CB',27,79,'SUI'],['Joe Scally','RB',21,76,'USA'],
        ['Luca Netz','LB',21,75,'GER'],['Manu Kone','CM',23,78,'FRA'],['Ramy Bensebaini','LB',29,78,'ALG'],
        ['Nathan N\'Goumou','RW',24,76,'FRA'],['Franck Honorat','RW',27,78,'FRA'],['Ko Itakura','CB',27,78,'JPN']
      ]},
    { id:'b04', name:'Bayer Leverkusen', short:'B04', leagueId:'bundesliga', color:'#E32221', rep:88, budget:95e6, fans:30000, stadium:'BayArena', formation:'3-4-2-1',
      stars:[
        ['Florian Wirtz','CAM',21,88,'GER'],['Victor Boniface','ST',23,83,'NGA'],['Granit Xhaka','CDM',31,84,'SUI'],
        ['Lukas Hradecky','GK',34,82,'FIN'],['Jonathan Tah','CB',28,84,'GER'],['Jeremie Frimpong','RWB',23,84,'NED'],
        ['Alex Grimaldo','LWB',28,85,'ESP'],['Exequiel Palacios','CM',25,82,'ARG'],['Jonas Hofmann','CAM',31,81,'GER'],
        ['Piero Hincapie','CB',22,81,'ECU'],['Nathan Tella','RW',24,79,'ENG'],['Patrik Schick','ST',28,81,'CZE']
      ]},
    { id:'wol', name:'Wolfsburg', short:'WOL', leagueId:'bundesliga', color:'#65B32E', rep:75, budget:45e6, fans:30000, stadium:'Volkswagen Arena', formation:'4-2-3-1',
      stars:[
        ['Jonas Wind','ST',25,79,'DEN'],['Lovas Son','CAM',24,76,'HUN'],['Maximilian Arnold','CM',30,79,'GER'],
        ['Koen Casteels','GK',32,81,'BEL'],['Maxence Lacroix','CB',24,79,'FRA'],['Ridle Baku','RB',26,78,'GER'],
        ['Paulo Otavio','LB',29,76,'BRA'],['Mattias Svanberg','CM',25,77,'SWE'],['Jonas Wind','ST',25,79,'DEN'],
        ['Patrick Wimmer','RW',23,78,'AUT'],['Yannick Gerhardt','CM',30,76,'GER'],['Sebastiaan Bornauw','CB',25,77,'BEL']
      ]},
    { id:'scf', name:'Freiburg', short:'SCF', leagueId:'bundesliga', color:'#000000', rep:76, budget:35e6, fans:34000, stadium:'Europa-Park Stadion', formation:'3-4-3',
      stars:[
        ['Vincenzo Grifo','LW',31,81,'ITA'],['Michael Gregoritsch','ST',30,78,'AUT'],['Merlin Rohl','CM',21,76,'GER'],
        ['Noah Atubolu','GK',22,77,'GER'],['Matthias Ginter','CB',30,81,'GER'],['Christian Gunter','LWB',31,77,'GER'],
        ['Lukas Kubler','RWB',31,75,'GER'],['Maximilian Eggestein','CDM',27,77,'GER'],['Roland Sallai','RW',27,78,'HUN'],
        ['Lucas Holer','ST',29,76,'GER'],['Philipp Lienhart','CB',27,78,'AUT'],['Ritsu Doan','RW',26,79,'JPN']
      ]},
    { id:'svp', name:'Stuttgart', short:'SVP', leagueId:'bundesliga', color:'#E32219', rep:78, budget:50e6, fans:60000, stadium:'MHPArena', formation:'4-2-3-1',
      stars:[
        ['Serhou Guirassy','ST',28,84,'GUI'],['Chris Fuhrich','LW',26,80,'GER'],['Enzo Millot','CAM',21,79,'FRA'],
        ['Alexander Nubel','GK',27,80,'GER'],['Waldemar Anton','CB',27,80,'GER'],['Hiroki Ito','CB',25,80,'JPN'],
        ['Maximilian Mittelstadt','LB',27,78,'GER'],['Atakan Karazor','CDM',27,77,'GER'],['Deniz Undav','ST',27,81,'GER'],
        ['Jamie Leweling','RW',23,77,'GER'],['Angelo Stiller','CM',23,79,'GER'],['Pascal Stenzel','RB',28,75,'GER']
      ]},
    { id:'tsv', name:'Hoffenheim', short:'TSG', leagueId:'bundesliga', color:'#1C63B7', rep:74, budget:40e6, fans:30000, stadium:'PreZero Arena', formation:'3-5-2',
      stars:[
        ['Andrej Kramaric','ST',33,80,'CRO'],['Wout Weghorst','ST',31,78,'NED'],['Grischa Promel','CM',29,77,'GER'],
        ['Oliver Baumann','GK',34,79,'GER'],['John Brooks','CB',31,77,'USA'],['Pavel Kaderabek','RWB',31,76,'CZE'],
        ['Robert Skov','LWB',28,76,'DEN'],['Anton Stach','CDM',25,77,'GER'],['Ihlas Bebou','RW',30,76,'TOG'],
        ['Marius Bulter','LW',31,75,'GER'],['Ozan Kabak','CB',24,77,'TUR'],['Finn Becker','CM',24,74,'GER']
      ]},
    { id:'wer', name:'Werder Bremen', short:'WER', leagueId:'bundesliga', color:'#1A472A', rep:73, budget:30e6, fans:42000, stadium:'Weserstadion', formation:'3-5-2',
      stars:[
        ['Marvin Ducksch','ST',30,79,'GER'],['Romano Schmid','CAM',24,77,'AUT'],['Leonardo Bittencourt','CM',30,76,'GER'],
        ['Michael Zetterer','GK',29,76,'GER'],['Milos Veljkovic','CB',28,77,'SRB'],['Anthony Jung','LWB',32,74,'GER'],
        ['Mitchell Weiser','RWB',30,76,'GER'],['Jens Stage','CM',27,76,'DEN'],['Justin Njinmah','ST',23,74,'GER'],
        ['Nick Woltemade','ST',22,75,'GER'],['Marco Friedl','CB',26,76,'AUT'],['Senne Lynen','CDM',25,75,'BEL']
      ]},

    // ——— Ligue 1 ———
    { id:'psg', name:'Paris Saint-Germain', short:'PSG', leagueId:'ligue1', color:'#004170', rep:91, budget:220e6, fans:48000, stadium:'Parc des Princes', formation:'4-3-3',
      stars:[
        ['Ousmane Dembele','RW',27,86,'FRA'],['Vitinha','CM',24,84,'POR'],['Achraf Hakimi','RB',25,85,'MAR'],
        ['Gianluigi Donnarumma','GK',25,88,'ITA'],['Marquinhos','CB',30,87,'BRA'],['Warren Zaire-Emery','CM',18,81,'FRA'],
        ['Bradley Barcola','LW',21,81,'FRA'],['Randal Kolo Muani','ST',25,82,'FRA'],['Nuno Mendes','LB',22,84,'POR'],
        ['Fabian Ruiz','CM',28,82,'ESP'],['Lucas Hernandez','CB',28,84,'FRA'],['Lee Kang-in','CAM',23,81,'KOR']
      ]},
    { id:'om', name:'Marseille', short:'OM', leagueId:'ligue1', color:'#2FAEE0', rep:80, budget:60e6, fans:67000, stadium:'Velodrome', formation:'4-3-3',
      stars:[
        ['Pierre-Emerick Aubameyang','ST',35,81,'GAB'],['Amine Harit','CAM',27,79,'MAR'],['Jordan Veretout','CM',31,78,'FRA'],
        ['Pau Lopez','GK',29,80,'ESP'],['Chancel Mbemba','CB',30,80,'COD'],['Leonardo Balerdi','CB',25,79,'ARG'],
        ['Jonathan Clauss','RB',31,80,'FRA'],['Ismael Bennacer','CDM',26,83,'ALG'],['Iliman Ndiaye','RW',24,79,'SEN'],
        ['Amine Gouiri','LW',24,79,'ALG'],['Geoffrey Kondogbia','CDM',31,79,'CAF'],['Renan Lodi','LB',26,78,'BRA']
      ]},
    { id:'ol', name:'Lyon', short:'OL', leagueId:'ligue1', color:'#0033A1', rep:78, budget:50e6, fans:59000, stadium:'Groupama Stadium', formation:'4-3-3',
      stars:[
        ['Alexandre Lacazette','ST',33,81,'FRA'],['Rayan Cherki','CAM',20,79,'FRA'],['Maxence Caqueret','CM',24,78,'FRA'],
        ['Anthony Lopes','GK',33,80,'POR'],['Castello Lukeba','CB',21,80,'FRA'],['Nicolas Tagliafico','LB',31,79,'ARG'],
        ['Corentin Tolisso','CM',29,79,'FRA'],['Said Benrahma','LW',28,79,'ALG'],['Ernest Nuamah','RW',20,77,'GHA'],
        ['Clinton Mata','RB',31,76,'ANG'],['Jake O\'Brien','CB',23,76,'IRL'],['Gift Orban','ST',21,76,'NGA']
      ]},
    { id:'asm', name:'Monaco', short:'ASM', leagueId:'ligue1', color:'#E20915', rep:82, budget:80e6, fans:16000, stadium:'Louis II', formation:'4-2-3-1',
      stars:[
        ['Wissam Ben Yedder','ST',33,82,'FRA'],['Takumi Minamino','CAM',29,80,'JPN'],['Youssouf Fofana','CDM',25,81,'FRA'],
        ['Philipp Kohn','GK',26,76,'SUI'],['Wilfried Singo','RB',23,80,'CIV'],['Guillermo Maripan','CB',30,79,'CHI'],
        ['Caio Henrique','LB',26,79,'BRA'],['Aleksandr Golovin','CAM',28,81,'RUS'],['Folarin Balogun','ST',22,80,'USA'],
        ['Maghnes Akliouche','RW',22,78,'FRA'],['Denis Zakaria','CDM',27,81,'SUI'],['Mohammed Salisu','CB',25,79,'GHA']
      ]},
    { id:'lil', name:'Lille', short:'LIL', leagueId:'ligue1', color:'#E01E26', rep:79, budget:55e6, fans:50000, stadium:'Pierre Mauroy', formation:'4-2-3-1',
      stars:[
        ['Jonathan David','ST',24,83,'CAN'],['Edon Zhegrova','RW',25,81,'KOS'],['Remy Cabella','CAM',34,79,'FRA'],
        ['Lucas Chevalier','GK',22,80,'FRA'],['Leny Yoro','CB',18,79,'FRA'],['Ismaily','LB',34,76,'BRA'],
        ['Benjamin Andre','CDM',33,79,'FRA'],['Angel Gomes','CAM',23,79,'ENG'],['Tiago Santos','RB',21,77,'POR'],
        ['Hakim Ziyech','RW',31,80,'MAR'],['Andre Gomes','CM',30,76,'POR'],['Bafode Diakite','CB',23,78,'FRA']
      ]},
    { id:'ren', name:'Rennes', short:'REN', leagueId:'ligue1', color:'#E1332D', rep:77, budget:50e6, fans:29000, stadium:'Roazhon Park', formation:'4-3-3',
      stars:[
        ['Arnaud Kalimuendo','ST',22,79,'FRA'],['Benjamin Bourigeaud','CAM',30,80,'FRA'],['Desire Doue','LW',19,78,'FRA'],
        ['Steve Mandanda','GK',39,78,'FRA'],['Arthur Theate','CB',24,79,'BEL'],['Adrien Truffert','LB',22,77,'FRA'],
        ['Baptiste Santamaria','CDM',29,77,'FRA'],['Amine Gouiri','ST',24,79,'ALG'],['Martin Terrier','LW',27,80,'FRA'],
        ['Lorenz Assignon','RB',24,75,'FRA'],['Enzo Le Fee','CM',24,78,'FRA'],['Warmed Omari','CB',24,76,'FRA']
      ]},
    { id:'nic', name:'Nice', short:'NIC', leagueId:'ligue1', color:'#D21033', rep:76, budget:45e6, fans:26000, stadium:'Allianz Riviera', formation:'4-3-3',
      stars:[
        ['Terem Moffi','ST',24,80,'NGA'],['Jeremie Boga','LW',27,79,'CIV'],['Morgan Sanson','CM',29,78,'FRA'],
        ['Marcin Bulka','GK',24,79,'POL'],['Jean-Clair Todibo','CB',24,81,'FRA'],['Melvin Bard','LB',23,77,'FRA'],
        ['Khéphren Thuram','CM',23,80,'FRA'],['Gaetan Laborde','ST',30,79,'FRA'],['Pablo Rosario','CDM',27,76,'NED'],
        ['Jordan Lotomba','RB',25,76,'SUI'],['Youssouf Ndayishimiye','CB',25,78,'BDI'],['Sofiane Diop','CAM',23,77,'FRA']
      ]},
    { id:'rcl', name:'Lens', short:'RCL', leagueId:'ligue1', color:'#E30613', rep:77, budget:40e6, fans:38000, stadium:'Bollaert-Delelis', formation:'3-4-3',
      stars:[
        ['Elye Wahi','ST',21,79,'FRA'],['Florian Sotoca','RW',33,78,'FRA'],['Przemyslaw Frankowski','RWB',29,78,'POL'],
        ['Brice Samba','GK',30,81,'FRA'],['Kevin Danso','CB',25,80,'AUT'],['Facundo Medina','CB',25,79,'ARG'],
        ['Deiver Machado','LWB',30,76,'COL'],['Neil El Aynaoui','CM',23,76,'MAR'],['Adrien Thomasson','CAM',30,77,'FRA'],
        ['Wesley Said','ST',29,76,'FRA'],['Andy Diouf','CM',21,76,'FRA'],['Abdukodir Khusanov','CB',20,75,'UZB']
      ]},
    { id:'str', name:'Strasbourg', short:'STR', leagueId:'ligue1', color:'#009FE3', rep:72, budget:30e6, fans:26000, stadium:'La Meinau', formation:'4-2-3-1',
      stars:[
        ['Emanuel Emegha','ST',21,76,'NED'],['Habib Diallo','ST',28,78,'SEN'],['Dilane Bakwa','RW',21,77,'FRA'],
        ['Matz Sels','GK',32,79,'BEL'],['Lucas Perrin','CB',25,75,'FRA'],['Marvin Senaya','RB',23,74,'FRA'],
        ['Habib Diarra','CM',20,76,'SEN'],['Andrey Santos','CDM',20,76,'BRA'],['Lebo Mothiba','ST',28,75,'RSA'],
        ['Thomas Delaine','LB',32,73,'FRA'],['Junior Mwanga','CM',20,74,'FRA'],['Abakar Sylla','CB',21,75,'CIV']
      ]},
    { id:'nte', name:'Nantes', short:'NTE', leagueId:'ligue1', color:'#FFE200', rep:72, budget:28e6, fans:35000, stadium:'Beaujoire', formation:'4-3-3',
      stars:[
        ['Mostafa Mohamed','ST',26,78,'EGY'],['Moses Simon','LW',29,78,'NGA'],['Pedro Chirivella','CM',27,76,'ESP'],
        ['Alban Lafont','GK',25,79,'FRA'],['Nicolas Pallois','CB',36,75,'FRA'],['Jean-Charles Castelletto','CB',29,76,'CMR'],
        ['Nicolas Cozza','LB',25,74,'FRA'],['Douglas Augusto','CDM',27,76,'BRA'],['Florent Mollet','CAM',32,76,'FRA'],
        ['Marcus Coco','RW',28,74,'FRA'],['Eray Comert','CB',26,75,'SUI'],['Kelvin Amian','RB',26,74,'FRA']
      ]},

    // ——— РПЛ ———
    { id:'zen', name:'Зенит', short:'ZEN', leagueId:'rpl', color:'#189BDD', rep:82, budget:45e6, fans:55000, stadium:'Газпром Арена', formation:'4-3-3',
      stars:[
        ['Матео Кассьерра','ST',27,80,'COL'],['Вендел','CM',26,81,'BRA'],['Клаудино','LW',25,79,'BRA'],
        ['Михаил Кержаков','GK',37,76,'RUS'],['Нуралы Алип','CB',24,76,'KAZ'],['Дуглас Сантос','LB',30,80,'BRA'],
        ['Вильмар Барриос','CDM',30,80,'COL'],['Андрей Мостовой','RW',26,78,'RUS'],['Педро','RW',18,74,'BRA'],
        ['Артём Дзюба','ST',35,77,'RUS'],['Роберт Ренан','CB',21,74,'BRA'],['Вячеслав Караваев','RB',29,76,'RUS']
      ]},
    { id:'spm', name:'Спартак', short:'SPM', leagueId:'rpl', color:'#E21A23', rep:80, budget:40e6, fans:45000, stadium:'Открытие Банк Арена', formation:'4-3-3',
      stars:[
        ['Квинси Промес','LW',32,80,'NED'],['Эсекьель Барко','CAM',25,79,'ARG'],['Тео Бонгонда','RW',28,78,'BEL'],
        ['Александр Максименко','GK',26,77,'RUS'],['Георгий Джикия','CB',30,77,'RUS'],['Даниил Хлусевич','LB',23,75,'RUS'],
        ['Роман Зобнин','CM',30,78,'RUS'],['Кристофер Мартинс','CDM',27,76,'LUX'],['Александр Соболев','ST',27,78,'RUS'],
        ['Руслан Литвинов','CB',23,74,'RUS'],['Антон Зиньковский','LW',27,75,'RUS'],['Наил Умяров','CDM',24,75,'RUS']
      ]},
    { id:'csk', name:'ЦСКА', short:'CSK', leagueId:'rpl', color:'#D32D2F', rep:79, budget:35e6, fans:30000, stadium:'ВЭБ Арена', formation:'3-5-2',
      stars:[
        ['Фёдор Чалов','ST',26,78,'RUS'],['Иван Обляков','CM',25,78,'RUS'],['Виктор Давила','CAM',26,76,'CHI'],
        ['Игорь Акинфеев','GK',38,80,'RUS'],['Виллиан Роша','CB',29,76,'BRA'],['Милан Гайич','RWB',28,75,'SRB'],
        ['Мойзес','LWB',28,76,'BRA'],['Саша Зделар','CDM',29,77,'SRB'],['Антон Зайцев','CB',26,74,'RUS'],
        ['Аббосбек Файзуллаев','CAM',20,76,'UZB'],['Антон Мухин','CM',22,72,'RUS'],['Тамерлан Мусаев','ST',22,73,'RUS']
      ]},
    { id:'dyn', name:'Динамо М', short:'DYN', leagueId:'rpl', color:'#1E5AA8', rep:78, budget:38e6, fans:26000, stadium:'ВТБ Арена', formation:'4-2-3-1',
      stars:[
        ['Константин Тюкавин','ST',22,78,'RUS'],['Биттелло','CAM',24,78,'BRA'],['Хорхе Карраскаль','CAM',26,77,'COL'],
        ['Антон Шунин','GK',37,76,'RUS'],['Роберто Фернандес','CB',24,75,'PAR'],['Дмитрий Скопинцев','LB',27,75,'RUS'],
        ['Даниил Фомин','CDM',27,77,'RUS'],['Вячеслав Грулёв','LW',25,75,'RUS'],['Никола Моро','CM',26,75,'CRO'],
        ['Сергей Паршивлюк','RB',35,72,'RUS'],['Фабиан Бальбуэна','CB',32,76,'PAR'],['Ярослав Гладышев','RW',21,73,'RUS']
      ]},
    { id:'lok', name:'Локомотив', short:'LOK', leagueId:'rpl', color:'#00481E', rep:77, budget:32e6, fans:27000, stadium:'РЖД Арена', formation:'4-4-2',
      stars:[
        ['Тимур Сулейманов','ST',24,75,'RUS'],['Антон Миранчук','CAM',28,77,'RUS'],['Дмитрий Баринов','CDM',30,76,'RUS'],
        ['Илья Лантратов','GK',28,76,'RUS'],['Максим Ненахов','RB',25,74,'RUS'],['Наир Тикинжау','LB',24,73,'RUS'],
        ['Сергей Пиняев','LW',19,76,'RUS'],['Рифат Жемалетдинов','RW',27,75,'RUS'],['Артур Беляев','CB',24,73,'RUS'],
        ['Константин Марадишвили','CM',24,74,'GEO'],['Герман Онугха','ST',28,75,'NGA'],['Алексей Батраков','CAM',19,73,'RUS']
      ]},
    { id:'krs', name:'Краснодар', short:'KRS', leagueId:'rpl', color:'#009639', rep:80, budget:42e6, fans:35000, stadium:'Стадион Краснодар', formation:'4-2-3-1',
      stars:[
        ['Джон Кордоба','ST',31,80,'COL'],['Эдуард Сперцян','CAM',24,80,'ARM'],['Олферс Кайо','CM',26,76,'BRA'],
        ['Матвей Сафонов','GK',25,81,'RUS'],['Юрий Газинский','CDM',34,74,'RUS'],['Сергей Волков','RB',23,74,'RUS'],
        ['Лукас Оласа','LB',26,75,'URU'],['Виктор Са','LW',30,76,'BRA'],['Никита Кривцов','CM',21,75,'RUS'],
        ['Кади Борхес','RW',27,76,'BRA'],['Александр Черников','CB',24,74,'RUS'],['Мозес Кобнан','ST',21,73,'CIV']
      ]},
    { id:'rub', name:'Рубин', short:'RUB', leagueId:'rpl', color:'#009B3A', rep:74, budget:22e6, fans:23000, stadium:'Ак Барс Арена', formation:'4-2-3-1',
      stars:[
        ['Мерт Чакин','ST',24,74,'TUR'],['Валентин Ведяков','CAM',22,72,'RUS'],['Игорь Безденежных','CM',25,72,'RUS'],
        ['Юрий Дюпин','GK',31,75,'RUS'],['Алексей Гуцуляк','RW',25,74,'UKR'],['Егор Тесленко','CB',22,72,'RUS'],
        ['Уго Малло','RB',32,73,'ESP'],['Рустам Хабибуллин','LB',24,71,'RUS'],['Дмитрий Кабутов','CDM',28,72,'RUS'],
        ['Марат Апшау','ST',22,71,'RUS'],['Никита Глушков','CM',24,71,'RUS'],['Александр Зотов','CB',26,72,'RUS']
      ]},
    { id:'soc', name:'Сочи', short:'SOC', leagueId:'rpl', color:'#0077C8', rep:72, budget:20e6, fans:10000, stadium:'Фишт', formation:'4-2-3-1',
      stars:[
        ['Мартин Крал','ST',25,73,'CZE'],['Кирилл Кравцов','CM',22,72,'RUS'],['Артур Юсупов','CAM',34,73,'RUS'],
        ['Денис Адамов','GK',26,74,'RUS'],['Ван Ян','CB',25,72,'CHN'],['Сергей Терехов','LB',30,72,'RUS'],
        ['Никита Бурмистров','RW',34,71,'RUS'],['Ибрагим Цаллагов','CDM',31,72,'RUS'],['Владимир Ильин','ST',31,72,'RUS'],
        ['Кирилл Заика','RB',28,71,'RUS'],['Артём Макарчук','LW',24,71,'RUS'],['Виктор Мелёхин','CB',20,72,'RUS']
      ]},
    { id:'akh', name:'Ахмат', short:'AKH', leagueId:'rpl', color:'#007A3D', rep:73, budget:25e6, fans:12000, stadium:'Ахмат Арена', formation:'4-2-3-1',
      stars:[
        ['Мохамед Коноэ','ST',27,74,'CIV'],['Лечи Садулаев','CAM',23,74,'RUS'],['Бернард Бериша','LW',30,74,'KOS'],
        ['Гиорги Шелия','GK',35,74,'GEO'],['Андрей Семёнов','CB',35,73,'RUS'],['Мирослав Богосавац','LB',27,72,'SRB'],
        ['Данил Голубев','CM',22,71,'RUS'],['Владислав Карапузов','RW',24,72,'RUS'],['Артем Тимофеев','CDM',28,72,'RUS'],
        ['Ильяс Садыгов','ST',22,70,'RUS'],['Жан-Кристоф','CB',26,72,'CMR'],['Рики','RB',25,71,'BRA']
      ]},
    { id:'fcr', name:'Ростов', short:'FCR', leagueId:'rpl', color:'#002F6C', rep:75, budget:28e6, fans:45000, stadium:'Ростов Арена', formation:'4-3-3',
      stars:[
        ['Николай Комличенко','ST',28,76,'RUS'],['Кирилл Щетинин','CM',22,74,'RUS'],['Данил Глебов','CDM',24,75,'RUS'],
        ['Сергей Песьяков','GK',35,75,'RUS'],['Максим Осипенко','CB',30,76,'RUS'],['Денис Терентьев','RB',31,72,'RUS'],
        ['Евгений Чернов','LB',31,72,'RUS'],['Алексей Ионов','RW',35,74,'RUS'],['Роналдо','ST',23,73,'BRA'],
        ['Хорен Байрамян','CAM',31,73,'ARM'],['Виктор Мелёхин','CB',20,72,'RUS'],['Антон','CM',24,71,'RUS']
      ]},
    { id:'kry', name:'Крылья Советов', short:'KRY', leagueId:'rpl', color:'#0057A0', rep:72, budget:18e6, fans:25000, stadium:'Самара Арена', formation:'4-2-3-1',
      stars:[
        ['Владислав Шитов','ST',21,72,'RUS'],['Фернандо Костанца','CM',24,73,'BRA'],['Бенджамин Гарре','RW',23,74,'ARG'],
        ['Иван Ломаев','GK',25,74,'RUS'],['Александр Солдатенков','CB',27,73,'RUS'],['Гленн Бейл','LB',24,71,'NED'],
        ['Роман Ежов','RW',26,72,'RUS'],['Максим Витюгов','CDM',26,71,'RUS'],['Дмитрий Цыпченко','ST',24,71,'RUS'],
        ['Юрий Горшков','LB',24,71,'RUS'],['Никита','CB',22,70,'RUS'],['Сергей Пиняев','LW',19,76,'RUS']
      ]},
    { id:'akh2', name:'Пари НН', short:'PNN', leagueId:'rpl', color:'#00A3E0', rep:71, budget:16e6, fans:15000, stadium:'Нижний Новгород', formation:'4-4-2',
      stars:[
        ['Николай','ST',25,71,'RUS'],['Дмитрий Столяревский','CAM',23,70,'RUS'],['Кирилл Гоцалюк','CM',22,70,'RUS'],
        ['Артур Нигматуллин','GK',32,73,'RUS'],['Кирилл Гоцук','CB',31,72,'RUS'],['Дмитрий Тихий','RB',28,70,'RUS'],
        ['Мамаду Майга','CDM',27,72,'MLI'],['Илья Жигулёв','CM',28,70,'RUS'],['Александр Ерохин','CM',34,73,'RUS'],
        ['Зе Турбо','ST',27,72,'GNB'],['Вячеслав Кротов','ST',30,71,'RUS'],['Эдгар','LW',24,70,'RUS']
      ]}
  ];

  // Fix nation codes that may be missing
  const EXTRA_NATIONS = {
    MLI:'Мали', JAM:'Ямайка', SVN:'Словения', ARM:'Армения', KOS:'Косово', MNE:'Черногория',
    BIH:'Босния', FIN:'Финляндия', GUI:'Гвинея', TOG:'Того', GAB:'Габон', COD:'ДР Конго',
    CAF:'ЦАР', ANG:'Ангола', BDI:'Бурунди', RSA:'ЮАР', KAZ:'Казахстан', LUX:'Люксембург',
    VEN:'Венесуэла', CHN:'Китай', UZB:'Узбекистан', GNB:'Гвинея-Бисау'
  };
  Object.assign(NATIONS, EXTRA_NATIONS);

  function leagueById(id) { return LEAGUES.find(l => l.id === id); }
  function clubsByLeague(leagueId) { return CLUBS.filter(c => c.leagueId === leagueId); }
  function clubTemplate(id) { return CLUBS.find(c => c.id === id); }
  function nationName(code) { return NATIONS[code] || code; }

  return { NATIONS, LEAGUES, CLUBS, leagueById, clubsByLeague, clubTemplate, nationName };
})();
