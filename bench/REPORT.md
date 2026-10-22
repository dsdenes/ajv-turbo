# ajv benchmark suite: replacement versus ajv

Measured 2026-10-22T05:18:30.671Z on Node.js 24.18.0.

## Environment

- Node.js: 24.18.0 (V8 13.6.233.17-node.50)
- Replacement: ajv 8.20.0 at commit 4b1e04b4b779541cc6b6dc6944d489c80d3f21de
- Benchmark suite: json-schema-benchmark at commit e9c884f9edd38438a150fef0e9a2a1173c0fcc50 (https://github.com/ebdrup/json-schema-benchmark)
- Cases: JSON-Schema-Test-Suite tests/draft7 and remotes at commit bcf1dc81ae099ade2a9642c672c06ee1af1bb489 (https://github.com/json-schema/JSON-Schema-Test-Suite)
- Machine: AMD Ryzen 9 5950X 16-Core Processor, 32 cores, x64, linux 7.0.0-38-generic, 94 GiB
- Procedure: Benchmark.js 2.1.4, Suite.run({async: false}), minTime 0s, maxTime 5s, minSamples 5; validate every document of the case per iteration

## Result

- Cases included: 193
- Documents verified: 695
- Verdict mismatches: 0
- Cases excluded (schema failed to compile): 52
- Aggregate: geometric mean of per-case throughput ratios (replacement / ajv) = **2.0257**
- Whole-suite throughput: ajv 15,794,758 documents/sec, replacement 32,184,193 documents/sec, ratio 2.038

## Per case

| Case | Documents | ajv (docs/sec) | Replacement (docs/sec) | Ratio |
|---|--:|--:|--:|--:|
| tests/draft7/additionalItems.json :: additionalItems as schema | 2 | 57,683,599 | 113,855,255 | 1.974 |
| tests/draft7/additionalItems.json :: array of items with no additionalItems | 5 | 190,850,355 | 300,796,577 | 1.576 |
| tests/draft7/additionalItems.json :: additionalItems are allowed by default | 1 | 101,234,778 | 103,505,399 | 1.022 |
| tests/draft7/additionalItems.json :: additionalItems should not look in applicators, invalid case | 1 | 35,451,644 | 76,368,976 | 2.154 |
| tests/draft7/additionalProperties.json :: additionalProperties being false does not allow other properties | 6 | 79,146,065 | 98,303,216 | 1.242 |
| tests/draft7/additionalProperties.json :: non-ASCII pattern with additionalProperties | 2 | 38,022,513 | 46,555,244 | 1.224 |
| tests/draft7/additionalProperties.json :: additionalProperties allows a schema which should validate | 3 | 23,568,370 | 100,247,309 | 4.253 |
| tests/draft7/additionalProperties.json :: additionalProperties can exist by itself | 2 | 17,489,749 | 91,294,660 | 5.220 |
| tests/draft7/additionalProperties.json :: additionalProperties are allowed by default | 1 | 122,149,636 | 129,901,473 | 1.063 |
| tests/draft7/additionalProperties.json :: additionalProperties should not look in applicators | 1 | 9,573,961 | 71,142,358 | 7.431 |
| tests/draft7/allOf.json :: allOf | 4 | 67,798,501 | 152,612,943 | 2.251 |
| tests/draft7/allOf.json :: allOf with base schema | 5 | 37,389,262 | 93,312,051 | 2.496 |
| tests/draft7/allOf.json :: allOf simple types | 2 | 87,859,041 | 165,465,567 | 1.883 |
| tests/draft7/allOf.json :: allOf with boolean schemas, all true | 1 | 136,639,052 | 130,375,638 | 0.954 |
| tests/draft7/allOf.json :: allOf with boolean schemas, some false | 1 | 54,858,050 | 126,041,924 | 2.298 |
| tests/draft7/allOf.json :: allOf with boolean schemas, all false | 1 | 55,113,559 | 122,395,586 | 2.221 |
| tests/draft7/allOf.json :: allOf with one empty schema | 1 | 136,132,190 | 133,731,268 | 0.982 |
| tests/draft7/allOf.json :: allOf with two empty schemas | 1 | 134,653,432 | 130,692,951 | 0.971 |
| tests/draft7/allOf.json :: allOf with the first empty schema | 2 | 101,789,113 | 211,245,609 | 2.075 |
| tests/draft7/allOf.json :: allOf with the last empty schema | 2 | 102,963,052 | 200,638,305 | 1.949 |
| tests/draft7/allOf.json :: nested allOf, to check validation semantics | 2 | 106,084,652 | 212,984,232 | 2.008 |
| tests/draft7/allOf.json :: allOf combined with anyOf, oneOf | 8 | 13,387,675 | 21,813,762 | 1.629 |
| tests/draft7/anyOf.json :: anyOf | 4 | 48,333,766 | 107,503,643 | 2.224 |
| tests/draft7/anyOf.json :: anyOf with base schema | 3 | 32,823,012 | 70,789,693 | 2.157 |
| tests/draft7/anyOf.json :: anyOf with boolean schemas, all true | 1 | 134,563,362 | 129,201,531 | 0.960 |
| tests/draft7/anyOf.json :: anyOf with boolean schemas, some true | 1 | 136,702,558 | 134,632,633 | 0.985 |
| tests/draft7/anyOf.json :: anyOf with boolean schemas, all false | 1 | 18,643,354 | 115,533,060 | 6.197 |
| tests/draft7/anyOf.json :: anyOf complex types | 4 | 40,827,065 | 165,768,398 | 4.060 |
| tests/draft7/anyOf.json :: anyOf with one empty schema | 2 | 253,446,945 | 233,147,046 | 0.920 |
| tests/draft7/anyOf.json :: nested anyOf, to check validation semantics | 2 | 37,513,010 | 222,045,278 | 5.919 |
| tests/draft7/anyOf.json :: nested anyOf, to check validation semantics | 2 | 38,900,449 | 217,222,006 | 5.584 |
| tests/draft7/boolean_schema.json :: boolean schema 'true' | 9 | 695,332,186 | 734,921,888 | 1.057 |
| tests/draft7/boolean_schema.json :: boolean schema 'false' | 9 | 57,514,685 | 424,459,838 | 7.380 |
| tests/draft7/const.json :: const validation | 3 | 78,390,506 | 177,848,424 | 2.269 |
| tests/draft7/const.json :: const with object | 4 | 15,441,934 | 20,527,007 | 1.329 |
| tests/draft7/const.json :: const with array | 3 | 17,887,378 | 27,345,867 | 1.529 |
| tests/draft7/const.json :: const with null | 2 | 89,151,751 | 203,520,980 | 2.283 |
| tests/draft7/const.json :: const with false does not match 0 | 3 | 82,731,389 | 263,442,170 | 3.184 |
| tests/draft7/const.json :: const with true does not match 1 | 3 | 81,827,191 | 267,939,496 | 3.274 |
| tests/draft7/const.json :: const with [false] does not match [0] | 3 | 32,083,166 | 48,386,339 | 1.508 |
| tests/draft7/const.json :: const with [true] does not match [1] | 3 | 31,181,743 | 46,258,754 | 1.484 |
| tests/draft7/const.json :: const with {"a": false} does not match {"a": 0} | 3 | 13,611,032 | 18,421,908 | 1.353 |
| tests/draft7/const.json :: const with {"a": true} does not match {"a": 1} | 3 | 13,519,613 | 19,118,635 | 1.414 |
| tests/draft7/const.json :: const with 0 does not match other zero-like types | 6 | 84,307,966 | 214,767,063 | 2.547 |
| tests/draft7/const.json :: const with 1 does not match true | 3 | 117,858,123 | 171,065,904 | 1.451 |
| tests/draft7/const.json :: const with -2.0 matches integer and float types | 5 | 93,601,988 | 306,015,255 | 3.269 |
| tests/draft7/const.json :: float and integers are equal up to 64-bit representation limits | 4 | 105,185,602 | 268,792,727 | 2.555 |
| tests/draft7/const.json :: nul characters in strings | 2 | 80,029,662 | 133,014,487 | 1.662 |
| tests/draft7/contains.json :: contains keyword validation | 6 | 24,100,449 | 221,079,926 | 9.173 |
| tests/draft7/contains.json :: contains keyword with const keyword | 3 | 16,401,108 | 188,572,414 | 11.498 |
| tests/draft7/contains.json :: contains keyword with boolean schema true | 2 | 91,962,744 | 171,726,295 | 1.867 |
| tests/draft7/contains.json :: contains keyword with boolean schema false | 3 | 57,057,884 | 197,001,975 | 3.453 |
| tests/draft7/contains.json :: items + contains | 4 | 11,087,107 | 15,381,328 | 1.387 |
| tests/draft7/default.json :: invalid type for default | 2 | 128,144,427 | 161,459,205 | 1.260 |
| tests/draft7/default.json :: invalid string value for default | 2 | 90,529,985 | 104,394,587 | 1.153 |
| tests/draft7/definitions.json :: valid definition | 1 | 1,661,902 | 38,533,452 | 23.186 |
| tests/draft7/definitions.json :: invalid definition | 1 | 1,696,602 | 29,205,834 | 17.214 |
| tests/draft7/dependencies.json :: dependencies | 7 | 159,353,894 | 301,704,332 | 1.893 |
| tests/draft7/dependencies.json :: dependencies with empty array | 3 | 357,255,849 | 359,387,189 | 1.006 |
| tests/draft7/dependencies.json :: multiple dependencies | 6 | 66,712,582 | 126,393,434 | 1.895 |
| tests/draft7/dependencies.json :: multiple dependencies subschema | 5 | 76,984,693 | 195,158,426 | 2.535 |
| tests/draft7/dependencies.json :: dependencies with boolean subschemas | 4 | 85,048,066 | 221,337,493 | 2.602 |
| tests/draft7/dependencies.json :: dependencies with escaped characters | 7 | 31,326,899 | 56,233,722 | 1.795 |
| tests/draft7/enum.json :: simple enum validation | 2 | 103,181,336 | 220,158,420 | 2.134 |
| tests/draft7/enum.json :: heterogeneous enum validation | 5 | 16,115,150 | 28,617,328 | 1.776 |
| tests/draft7/enum.json :: heterogeneous enum-with-null validation | 3 | 124,058,755 | 195,661,243 | 1.577 |
| tests/draft7/enum.json :: enums in properties | 6 | 75,724,942 | 189,206,706 | 2.499 |
| tests/draft7/enum.json :: enum with escaped characters | 3 | 136,221,671 | 271,956,458 | 1.996 |
| tests/draft7/enum.json :: enum with false does not match 0 | 3 | 94,585,932 | 309,653,722 | 3.274 |
| tests/draft7/enum.json :: enum with true does not match 1 | 3 | 95,041,992 | 310,866,679 | 3.271 |
| tests/draft7/enum.json :: enum with 0 does not match false | 3 | 128,719,575 | 210,575,741 | 1.636 |
| tests/draft7/enum.json :: enum with 1 does not match true | 3 | 128,101,232 | 197,442,815 | 1.541 |
| tests/draft7/enum.json :: nul characters in strings | 2 | 88,902,751 | 136,695,777 | 1.538 |
| tests/draft7/exclusiveMaximum.json :: exclusiveMaximum validation | 4 | 104,079,654 | 272,844,033 | 2.621 |
| tests/draft7/exclusiveMinimum.json :: exclusiveMinimum validation | 4 | 105,219,019 | 252,939,977 | 2.404 |
| tests/draft7/if-then-else.json :: if and then without else | 3 | 87,162,449 | 203,821,576 | 2.338 |
| tests/draft7/if-then-else.json :: if and else without then | 3 | 67,363,263 | 141,795,447 | 2.105 |
| tests/draft7/if-then-else.json :: validate against correct branch, then vs else | 4 | 48,368,415 | 151,811,274 | 3.139 |
| tests/draft7/if-then-else.json :: if with boolean schema true | 2 | 102,867,825 | 213,626,900 | 2.077 |
| tests/draft7/if-then-else.json :: if with boolean schema false | 2 | 101,921,042 | 208,833,075 | 2.049 |
| tests/draft7/if-then-else.json :: if appears at the end when serialized (keyword processing sequence) | 4 | 55,782,601 | 90,044,978 | 1.614 |
| tests/draft7/infinite-loop-detection.json :: evaluating the same schema location against the same data location twice is not a sign of an infinite loop | 2 | 66,054,586 | 95,148,087 | 1.440 |
| tests/draft7/items.json :: a schema given for items | 4 | 110,115,044 | 198,160,254 | 1.800 |
| tests/draft7/items.json :: an array of schemas for items | 6 | 177,102,939 | 242,127,219 | 1.367 |
| tests/draft7/items.json :: items with boolean schema (true) | 2 | 256,280,311 | 262,589,092 | 1.025 |
| tests/draft7/items.json :: items with boolean schema (false) | 2 | 75,032,818 | 175,376,080 | 2.337 |
| tests/draft7/items.json :: items with boolean schemas | 3 | 125,123,154 | 228,644,253 | 1.827 |
| tests/draft7/items.json :: items and subitems | 6 | 30,450,823 | 64,142,676 | 2.106 |
| tests/draft7/items.json :: nested items | 3 | 15,678,986 | 52,866,464 | 3.372 |
| tests/draft7/maximum.json :: maximum validation | 4 | 149,736,971 | 259,582,316 | 1.734 |
| tests/draft7/maximum.json :: maximum validation with unsigned integer | 4 | 144,432,465 | 247,359,512 | 1.713 |
| tests/draft7/maxItems.json :: maxItems validation | 4 | 162,819,530 | 279,750,494 | 1.718 |
| tests/draft7/maxLength.json :: maxLength validation | 5 | 122,617,984 | 150,602,595 | 1.228 |
| tests/draft7/maxProperties.json :: maxProperties validation | 6 | 96,229,485 | 143,002,072 | 1.486 |
| tests/draft7/maxProperties.json :: maxProperties = 0 means the object is empty | 2 | 52,015,520 | 76,247,018 | 1.466 |
| tests/draft7/minimum.json :: minimum validation | 4 | 132,583,026 | 228,322,976 | 1.722 |
| tests/draft7/minimum.json :: minimum validation with signed integer | 7 | 139,580,608 | 285,335,520 | 2.044 |
| tests/draft7/minItems.json :: minItems validation | 4 | 143,463,877 | 245,510,581 | 1.711 |
| tests/draft7/minLength.json :: minLength validation | 5 | 88,436,712 | 145,292,342 | 1.643 |
| tests/draft7/minProperties.json :: minProperties validation | 6 | 106,055,415 | 147,978,113 | 1.395 |
| tests/draft7/multipleOf.json :: by int | 3 | 90,947,751 | 130,668,659 | 1.437 |
| tests/draft7/multipleOf.json :: by number | 3 | 74,496,462 | 106,376,059 | 1.428 |
| tests/draft7/multipleOf.json :: by small number | 2 | 57,108,338 | 91,757,035 | 1.607 |
| tests/draft7/multipleOf.json :: invalid instance should not raise error when float division = inf | 1 | 10,855,102 | 12,089,292 | 1.114 |
| tests/draft7/not.json :: not | 2 | 65,470,181 | 179,478,946 | 2.741 |
| tests/draft7/not.json :: not multiple types | 3 | 60,477,518 | 220,430,011 | 3.645 |
| tests/draft7/not.json :: not more complex schema | 3 | 72,708,355 | 226,149,733 | 3.110 |
| tests/draft7/not.json :: forbidden property | 2 | 77,380,798 | 168,243,192 | 2.174 |
| tests/draft7/not.json :: not with boolean schema true | 1 | 50,712,347 | 117,234,254 | 2.312 |
| tests/draft7/not.json :: not with boolean schema false | 1 | 136,224,525 | 135,350,731 | 0.994 |
| tests/draft7/oneOf.json :: oneOf | 4 | 29,715,676 | 100,802,925 | 3.392 |
| tests/draft7/oneOf.json :: oneOf with base schema | 3 | 39,693,765 | 68,431,292 | 1.724 |
| tests/draft7/oneOf.json :: oneOf with boolean schemas, all true | 1 | 44,845,107 | 117,407,219 | 2.618 |
| tests/draft7/oneOf.json :: oneOf with boolean schemas, one true | 1 | 24,669,614 | 132,494,074 | 5.371 |
| tests/draft7/oneOf.json :: oneOf with boolean schemas, more than one true | 1 | 44,515,998 | 118,337,140 | 2.658 |
| tests/draft7/oneOf.json :: oneOf with boolean schemas, all false | 1 | 16,882,632 | 119,683,300 | 7.089 |
| tests/draft7/oneOf.json :: oneOf complex types | 4 | 31,530,426 | 114,066,675 | 3.618 |
| tests/draft7/oneOf.json :: oneOf with empty schema | 2 | 57,015,417 | 217,430,052 | 3.814 |
| tests/draft7/oneOf.json :: oneOf with required | 4 | 26,498,334 | 127,332,438 | 4.805 |
| tests/draft7/oneOf.json :: oneOf with missing optional property | 4 | 32,559,075 | 144,361,555 | 4.434 |
| tests/draft7/oneOf.json :: nested oneOf, to check validation semantics | 2 | 41,291,520 | 215,998,570 | 5.231 |
| tests/draft7/optional/bignum.json :: integer | 1 | 25,083,774 | 26,037,274 | 1.038 |
| tests/draft7/optional/bignum.json :: number | 1 | 113,535,150 | 111,125,428 | 0.979 |
| tests/draft7/optional/bignum.json :: integer | 1 | 25,012,481 | 26,494,825 | 1.059 |
| tests/draft7/optional/bignum.json :: number | 1 | 114,972,146 | 120,928,075 | 1.052 |
| tests/draft7/optional/bignum.json :: string | 1 | 57,421,648 | 118,170,062 | 2.058 |
| tests/draft7/optional/bignum.json :: integer comparison | 1 | 110,396,678 | 103,971,723 | 0.942 |
| tests/draft7/optional/bignum.json :: float comparison with high precision | 1 | 48,811,626 | 104,499,064 | 2.141 |
| tests/draft7/optional/bignum.json :: integer comparison | 1 | 111,368,899 | 102,411,665 | 0.920 |
| tests/draft7/optional/bignum.json :: float comparison with high precision on negative numbers | 1 | 49,117,462 | 100,861,829 | 2.053 |
| tests/draft7/optional/content.json :: validation of string-encoded content based on media type | 3 | 355,519,147 | 377,663,421 | 1.062 |
| tests/draft7/optional/content.json :: validation of binary string-encoding | 3 | 366,627,680 | 368,074,216 | 1.004 |
| tests/draft7/optional/content.json :: validation of binary-encoded media type documents | 4 | 482,084,345 | 479,412,450 | 0.994 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 regex $ does not match trailing newline | 2 | 45,141,315 | 55,457,168 | 1.229 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 regex converts \t to horizontal tab | 2 | 47,092,717 | 55,194,268 | 1.172 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 regex escapes control codes with \c and upper letter | 2 | 46,546,914 | 54,298,223 | 1.167 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 regex escapes control codes with \c and lower letter | 2 | 47,530,819 | 55,253,474 | 1.162 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 \d matches ascii digits only | 3 | 46,278,399 | 60,054,495 | 1.298 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 \D matches everything but ascii digits | 3 | 51,180,048 | 54,273,069 | 1.060 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 \w matches ascii letters only | 2 | 48,088,201 | 56,748,688 | 1.180 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 \W matches everything but ascii letters | 2 | 47,905,435 | 54,393,998 | 1.135 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 \s matches whitespace | 11 | 56,904,551 | 59,751,513 | 1.050 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 \S matches everything but whitespace | 11 | 46,136,316 | 65,976,907 | 1.430 |
| tests/draft7/optional/float-overflow.json :: all integers are multiples of 0.5, if overflow is handled | 1 | 12,705,508 | 14,148,444 | 1.114 |
| tests/draft7/optional/non-bmp-regex.json :: Proper UTF-16 surrogate pair handling: pattern | 7 | 49,504,593 | 61,453,981 | 1.241 |
| tests/draft7/optional/non-bmp-regex.json :: Proper UTF-16 surrogate pair handling: patternProperties | 5 | 12,144,444 | 41,272,045 | 3.398 |
| tests/draft7/pattern.json :: pattern validation | 8 | 138,594,400 | 147,847,924 | 1.067 |
| tests/draft7/pattern.json :: pattern is not anchored | 1 | 41,140,783 | 39,809,403 | 0.968 |
| tests/draft7/patternProperties.json :: patternProperties validates properties matching a regex | 7 | 19,170,574 | 50,406,782 | 2.629 |
| tests/draft7/patternProperties.json :: multiple simultaneous patternProperties are validated | 6 | 10,038,761 | 22,578,699 | 2.249 |
| tests/draft7/patternProperties.json :: regexes are not anchored by default and are case sensitive | 4 | 10,288,619 | 23,818,353 | 2.315 |
| tests/draft7/patternProperties.json :: patternProperties with boolean schemas | 5 | 11,755,209 | 41,059,403 | 3.493 |
| tests/draft7/properties.json :: object properties validation | 6 | 94,179,125 | 215,315,398 | 2.286 |
| tests/draft7/properties.json :: properties with boolean schema | 4 | 77,295,045 | 187,515,396 | 2.426 |
| tests/draft7/properties.json :: properties with escaped characters | 2 | 46,064,021 | 103,483,576 | 2.247 |
| tests/draft7/propertyNames.json :: propertyNames validation | 6 | 60,943,500 | 95,671,085 | 1.570 |
| tests/draft7/propertyNames.json :: propertyNames with boolean schema true | 2 | 222,617,797 | 222,077,423 | 0.998 |
| tests/draft7/propertyNames.json :: propertyNames with boolean schema false | 2 | 36,197,104 | 96,047,164 | 2.653 |
| tests/draft7/ref.json :: root pointer ref | 4 | 29,647,577 | 72,336,365 | 2.440 |
| tests/draft7/ref.json :: relative pointer ref to object | 2 | 70,374,468 | 139,024,500 | 1.975 |
| tests/draft7/ref.json :: relative pointer ref to array | 2 | 69,385,296 | 112,971,252 | 1.628 |
| tests/draft7/ref.json :: escaped pointer ref | 6 | 72,178,780 | 158,503,819 | 2.196 |
| tests/draft7/ref.json :: nested refs | 2 | 88,687,609 | 176,074,667 | 1.985 |
| tests/draft7/ref.json :: ref overrides any sibling keywords | 3 | 65,198,975 | 145,567,044 | 2.233 |
| tests/draft7/ref.json :: remote ref, containing refs itself | 2 | 4,623,892 | 64,786,078 | 14.011 |
| tests/draft7/ref.json :: property named $ref that is not a reference | 2 | 73,632,404 | 144,282,310 | 1.959 |
| tests/draft7/ref.json :: property named $ref, containing an actual $ref | 2 | 73,258,885 | 149,889,492 | 2.046 |
| tests/draft7/ref.json :: $ref to boolean schema true | 1 | 115,640,282 | 120,033,496 | 1.038 |
| tests/draft7/ref.json :: $ref to boolean schema false | 1 | 51,987,199 | 118,178,690 | 2.273 |
| tests/draft7/ref.json :: refs with quote | 2 | 78,947,811 | 164,374,567 | 2.082 |
| tests/draft7/ref.json :: naive replacement of $ref with its destination is not correct | 2 | 22,196,279 | 31,410,679 | 1.415 |
| tests/draft7/refRemote.json :: remote ref | 2 | 98,738,447 | 198,227,626 | 2.008 |
| tests/draft7/required.json :: required validation | 5 | 152,568,865 | 300,207,701 | 1.968 |
| tests/draft7/required.json :: required default validation | 1 | 134,825,745 | 135,860,854 | 1.008 |
| tests/draft7/required.json :: required with empty array | 1 | 135,061,554 | 134,436,616 | 0.995 |
| tests/draft7/required.json :: required with escaped characters | 2 | 60,605,464 | 140,029,056 | 2.311 |
| tests/draft7/type.json :: integer type matches integers | 9 | 75,530,567 | 195,645,941 | 2.590 |
| tests/draft7/type.json :: number type matches numbers | 9 | 96,549,222 | 334,262,253 | 3.462 |
| tests/draft7/type.json :: string type matches strings | 9 | 99,073,354 | 344,398,073 | 3.476 |
| tests/draft7/type.json :: object type matches objects | 7 | 75,330,443 | 319,719,890 | 4.244 |
| tests/draft7/type.json :: array type matches arrays | 7 | 74,663,648 | 322,924,257 | 4.325 |
| tests/draft7/type.json :: boolean type matches booleans | 10 | 85,067,616 | 341,172,707 | 4.011 |
| tests/draft7/type.json :: null type matches only the null object | 10 | 76,735,855 | 348,323,209 | 4.539 |
| tests/draft7/type.json :: multiple types can be specified in an array | 7 | 80,518,024 | 217,091,185 | 2.696 |
| tests/draft7/type.json :: type as array with one item | 2 | 105,115,491 | 222,367,755 | 2.115 |
| tests/draft7/type.json :: type: array or object | 5 | 100,453,500 | 300,484,280 | 2.991 |
| tests/draft7/type.json :: type: array, object or null | 5 | 141,002,679 | 306,976,449 | 2.177 |
| tests/draft7/uniqueItems.json :: uniqueItems validation | 23 | 14,461,047 | 22,308,144 | 1.543 |
| tests/draft7/uniqueItems.json :: uniqueItems with an array of items | 8 | 29,174,286 | 46,381,700 | 1.590 |
| tests/draft7/uniqueItems.json :: uniqueItems with an array of items and additionalItems=false | 5 | 39,492,961 | 87,993,121 | 2.228 |
| tests/draft7/uniqueItems.json :: uniqueItems=false validation | 15 | 1,092,053,623 | 713,040,378 | 0.653 |
| tests/draft7/uniqueItems.json :: uniqueItems=false with an array of items | 8 | 259,566,775 | 273,409,349 | 1.053 |
| tests/draft7/uniqueItems.json :: uniqueItems=false with an array of items and additionalItems=false | 5 | 160,840,099 | 232,217,387 | 1.444 |

## Excluded cases

Schemas that a validator could not compile carry no comparable verdict.

- tests/draft7/additionalItems.json :: items is schema, no additionalItems (ajv: strict mode: "additionalItems" is ignored when "items" is not an array of schemas)
- tests/draft7/additionalItems.json :: additionalItems as false without items (ajv: strict mode: "additionalItems" is ignored when "items" is not an array of schemas)
- tests/draft7/additionalItems.json :: additionalItems should not look in applicators, valid case (ajv: strict mode: "additionalItems" is ignored when "items" is not an array of schemas)
- tests/draft7/format.json :: validation of e-mail addresses (ajv: unknown format "email" ignored in schema at path "#")
- tests/draft7/format.json :: validation of IDN e-mail addresses (ajv: unknown format "idn-email" ignored in schema at path "#")
- tests/draft7/format.json :: validation of regexes (ajv: unknown format "regex" ignored in schema at path "#")
- tests/draft7/format.json :: validation of IP addresses (ajv: unknown format "ipv4" ignored in schema at path "#")
- tests/draft7/format.json :: validation of IPv6 addresses (ajv: unknown format "ipv6" ignored in schema at path "#")
- tests/draft7/format.json :: validation of IDN hostnames (ajv: unknown format "idn-hostname" ignored in schema at path "#")
- tests/draft7/format.json :: validation of hostnames (ajv: unknown format "hostname" ignored in schema at path "#")
- tests/draft7/format.json :: validation of date strings (ajv: unknown format "date" ignored in schema at path "#")
- tests/draft7/format.json :: validation of date-time strings (ajv: unknown format "date-time" ignored in schema at path "#")
- tests/draft7/format.json :: validation of time strings (ajv: unknown format "time" ignored in schema at path "#")
- tests/draft7/format.json :: validation of JSON pointers (ajv: unknown format "json-pointer" ignored in schema at path "#")
- tests/draft7/format.json :: validation of relative JSON pointers (ajv: unknown format "relative-json-pointer" ignored in schema at path "#")
- tests/draft7/format.json :: validation of IRIs (ajv: unknown format "iri" ignored in schema at path "#")
- tests/draft7/format.json :: validation of IRI references (ajv: unknown format "iri-reference" ignored in schema at path "#")
- tests/draft7/format.json :: validation of URIs (ajv: unknown format "uri" ignored in schema at path "#")
- tests/draft7/format.json :: validation of URI references (ajv: unknown format "uri-reference" ignored in schema at path "#")
- tests/draft7/format.json :: validation of URI templates (ajv: unknown format "uri-template" ignored in schema at path "#")
- tests/draft7/if-then-else.json :: ignore if without then or else (ajv: strict mode: "if" without "then" and "else" is ignored)
- tests/draft7/if-then-else.json :: ignore then without if (ajv: strict mode: "then" without "if" is ignored)
- tests/draft7/if-then-else.json :: ignore else without if (ajv: strict mode: "else" without "if" is ignored)
- tests/draft7/if-then-else.json :: non-interference across combined schemas (ajv: strict mode: "if" without "then" and "else" is ignored)
- tests/draft7/optional/format/date-time.json :: validation of date-time strings (ajv: unknown format "date-time" ignored in schema at path "#")
- tests/draft7/optional/format/date.json :: validation of date strings (ajv: unknown format "date" ignored in schema at path "#")
- tests/draft7/optional/format/email.json :: validation of e-mail addresses (ajv: unknown format "email" ignored in schema at path "#")
- tests/draft7/optional/format/hostname.json :: validation of host names (ajv: unknown format "hostname" ignored in schema at path "#")
- tests/draft7/optional/format/idn-email.json :: validation of an internationalized e-mail addresses (ajv: unknown format "idn-email" ignored in schema at path "#")
- tests/draft7/optional/format/idn-hostname.json :: validation of internationalized host names (ajv: unknown format "idn-hostname" ignored in schema at path "#")
- tests/draft7/optional/format/ipv4.json :: validation of IP addresses (ajv: unknown format "ipv4" ignored in schema at path "#")
- tests/draft7/optional/format/ipv6.json :: validation of IPv6 addresses (ajv: unknown format "ipv6" ignored in schema at path "#")
- tests/draft7/optional/format/iri-reference.json :: validation of IRI References (ajv: unknown format "iri-reference" ignored in schema at path "#")
- tests/draft7/optional/format/iri.json :: validation of IRIs (ajv: unknown format "iri" ignored in schema at path "#")
- tests/draft7/optional/format/json-pointer.json :: validation of JSON-pointers (JSON String Representation) (ajv: unknown format "json-pointer" ignored in schema at path "#")
- tests/draft7/optional/format/regex.json :: validation of regular expressions (ajv: unknown format "regex" ignored in schema at path "#")
- tests/draft7/optional/format/relative-json-pointer.json :: validation of Relative JSON Pointers (RJP) (ajv: unknown format "relative-json-pointer" ignored in schema at path "#")
- tests/draft7/optional/format/time.json :: validation of time strings (ajv: unknown format "time" ignored in schema at path "#")
- tests/draft7/optional/format/uri-reference.json :: validation of URI References (ajv: unknown format "uri-reference" ignored in schema at path "#")
- tests/draft7/optional/format/uri-template.json :: format: uri-template (ajv: unknown format "uri-template" ignored in schema at path "#")
- tests/draft7/optional/format/uri.json :: validation of URIs (ajv: unknown format "uri" ignored in schema at path "#")
- tests/draft7/properties.json :: properties, patternProperties, additionalProperties interaction (ajv: strict mode: property foo matches pattern f.o (use allowMatchingProperties))
- tests/draft7/ref.json :: Recursive references between schemas (ajv: can't resolve reference node from id #)
- tests/draft7/ref.json :: Location-independent identifier (ajv: can't resolve reference #foo from id #)
- tests/draft7/ref.json :: Location-independent identifier with absolute URI (ajv: can't resolve reference http://localhost:1234/bar#foo from id #)
- tests/draft7/ref.json :: Location-independent identifier with base URI change in subschema (ajv: can't resolve reference http://localhost:1234/nested.json#foo from id #)
- tests/draft7/refRemote.json :: fragment within remote ref (ajv: strict mode: unknown keyword: "integer")
- tests/draft7/refRemote.json :: ref within remote ref (ajv: strict mode: unknown keyword: "integer")
- tests/draft7/refRemote.json :: base URI change (ajv: can't resolve reference folderInteger.json from id #)
- tests/draft7/refRemote.json :: base URI change - change folder (ajv: can't resolve reference folderInteger.json from id #)
- tests/draft7/refRemote.json :: base URI change - change folder in subschema (ajv: can't resolve reference folderInteger.json from id #)
- tests/draft7/refRemote.json :: root ref in remote ref (ajv: can't resolve reference name.json#/definitions/orNull from id #)
