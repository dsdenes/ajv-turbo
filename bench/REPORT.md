# ajv benchmark suite: replacement versus ajv

Measured 2026-10-22T18:25:07.732Z on Node.js 24.18.0.

## Environment

- Node.js: 24.18.0 (V8 13.6.233.17-node.50)
- Replacement: ajv 8.20.0 at commit 2e6bc37f158597f99bed1eca365cc47d68ad93c8
- Benchmark suite: json-schema-benchmark at commit e9c884f9edd38438a150fef0e9a2a1173c0fcc50 (https://github.com/ebdrup/json-schema-benchmark)
- Cases: JSON-Schema-Test-Suite tests/draft7 and remotes at commit bcf1dc81ae099ade2a9642c672c06ee1af1bb489 (https://github.com/json-schema/JSON-Schema-Test-Suite)
- Machine: AMD Ryzen 9 5950X 16-Core Processor, 32 cores, x64, linux 7.0.0-38-generic, 94 GiB
- Procedure: Benchmark.js 2.1.4, Suite.run({async: false}), minTime 0s, maxTime 5s, minSamples 5; validate every document of the case per iteration

## Result

- Cases included: 193
- Documents verified: 695
- Verdict mismatches: 0
- Cases excluded (schema failed to compile): 52
- Aggregate: geometric mean of per-case throughput ratios (replacement / ajv) = **2.0439**
- Whole-suite throughput: ajv 18,494,274 documents/sec, replacement 38,430,620 documents/sec, ratio 2.078

## Per case

| Case | Documents | ajv (docs/sec) | Replacement (docs/sec) | Ratio |
|---|--:|--:|--:|--:|
| tests/draft7/additionalItems.json :: additionalItems as schema | 2 | 64,283,020 | 122,071,793 | 1.899 |
| tests/draft7/additionalItems.json :: array of items with no additionalItems | 5 | 217,286,564 | 338,527,886 | 1.558 |
| tests/draft7/additionalItems.json :: additionalItems are allowed by default | 1 | 110,395,139 | 112,153,327 | 1.016 |
| tests/draft7/additionalItems.json :: additionalItems should not look in applicators, invalid case | 1 | 40,019,303 | 86,599,776 | 2.164 |
| tests/draft7/additionalProperties.json :: additionalProperties being false does not allow other properties | 6 | 92,351,129 | 112,149,866 | 1.214 |
| tests/draft7/additionalProperties.json :: non-ASCII pattern with additionalProperties | 2 | 42,861,235 | 51,526,446 | 1.202 |
| tests/draft7/additionalProperties.json :: additionalProperties allows a schema which should validate | 3 | 26,883,620 | 112,525,678 | 4.186 |
| tests/draft7/additionalProperties.json :: additionalProperties can exist by itself | 2 | 19,807,035 | 108,147,834 | 5.460 |
| tests/draft7/additionalProperties.json :: additionalProperties are allowed by default | 1 | 138,043,018 | 131,655,557 | 0.954 |
| tests/draft7/additionalProperties.json :: additionalProperties should not look in applicators | 1 | 10,752,069 | 78,017,638 | 7.256 |
| tests/draft7/allOf.json :: allOf | 4 | 71,353,523 | 171,669,101 | 2.406 |
| tests/draft7/allOf.json :: allOf with base schema | 5 | 41,253,357 | 102,682,746 | 2.489 |
| tests/draft7/allOf.json :: allOf simple types | 2 | 95,538,147 | 176,621,302 | 1.849 |
| tests/draft7/allOf.json :: allOf with boolean schemas, all true | 1 | 137,168,419 | 141,056,366 | 1.028 |
| tests/draft7/allOf.json :: allOf with boolean schemas, some false | 1 | 56,191,642 | 133,784,332 | 2.381 |
| tests/draft7/allOf.json :: allOf with boolean schemas, all false | 1 | 58,061,611 | 127,956,986 | 2.204 |
| tests/draft7/allOf.json :: allOf with one empty schema | 1 | 147,984,965 | 152,962,161 | 1.034 |
| tests/draft7/allOf.json :: allOf with two empty schemas | 1 | 153,390,110 | 145,174,544 | 0.946 |
| tests/draft7/allOf.json :: allOf with the first empty schema | 2 | 108,714,924 | 218,525,950 | 2.010 |
| tests/draft7/allOf.json :: allOf with the last empty schema | 2 | 109,650,682 | 228,911,644 | 2.088 |
| tests/draft7/allOf.json :: nested allOf, to check validation semantics | 2 | 114,742,700 | 247,215,398 | 2.155 |
| tests/draft7/allOf.json :: allOf combined with anyOf, oneOf | 8 | 14,899,816 | 24,402,567 | 1.638 |
| tests/draft7/anyOf.json :: anyOf | 4 | 50,642,228 | 115,879,908 | 2.288 |
| tests/draft7/anyOf.json :: anyOf with base schema | 3 | 34,622,396 | 77,497,314 | 2.238 |
| tests/draft7/anyOf.json :: anyOf with boolean schemas, all true | 1 | 149,925,300 | 144,311,099 | 0.963 |
| tests/draft7/anyOf.json :: anyOf with boolean schemas, some true | 1 | 153,730,792 | 151,485,418 | 0.985 |
| tests/draft7/anyOf.json :: anyOf with boolean schemas, all false | 1 | 21,434,393 | 133,141,015 | 6.212 |
| tests/draft7/anyOf.json :: anyOf complex types | 4 | 45,771,835 | 188,620,996 | 4.121 |
| tests/draft7/anyOf.json :: anyOf with one empty schema | 2 | 285,804,710 | 255,317,183 | 0.893 |
| tests/draft7/anyOf.json :: nested anyOf, to check validation semantics | 2 | 42,326,996 | 247,913,811 | 5.857 |
| tests/draft7/anyOf.json :: nested anyOf, to check validation semantics | 2 | 42,947,832 | 254,925,566 | 5.936 |
| tests/draft7/boolean_schema.json :: boolean schema 'true' | 9 | 927,397,299 | 995,351,453 | 1.073 |
| tests/draft7/boolean_schema.json :: boolean schema 'false' | 9 | 70,477,761 | 514,982,173 | 7.307 |
| tests/draft7/const.json :: const validation | 3 | 98,254,809 | 230,290,840 | 2.344 |
| tests/draft7/const.json :: const with object | 4 | 21,272,350 | 27,942,199 | 1.314 |
| tests/draft7/const.json :: const with array | 3 | 24,147,642 | 37,025,022 | 1.533 |
| tests/draft7/const.json :: const with null | 2 | 115,212,631 | 270,060,700 | 2.344 |
| tests/draft7/const.json :: const with false does not match 0 | 3 | 102,356,219 | 342,625,288 | 3.347 |
| tests/draft7/const.json :: const with true does not match 1 | 3 | 102,653,682 | 336,970,140 | 3.283 |
| tests/draft7/const.json :: const with [false] does not match [0] | 3 | 42,450,471 | 61,733,478 | 1.454 |
| tests/draft7/const.json :: const with [true] does not match [1] | 3 | 40,719,565 | 59,349,446 | 1.458 |
| tests/draft7/const.json :: const with {"a": false} does not match {"a": 0} | 3 | 18,060,144 | 24,981,240 | 1.383 |
| tests/draft7/const.json :: const with {"a": true} does not match {"a": 1} | 3 | 18,102,693 | 25,116,033 | 1.387 |
| tests/draft7/const.json :: const with 0 does not match other zero-like types | 6 | 106,624,979 | 272,683,448 | 2.557 |
| tests/draft7/const.json :: const with 1 does not match true | 3 | 145,798,708 | 224,740,295 | 1.541 |
| tests/draft7/const.json :: const with -2.0 matches integer and float types | 5 | 118,058,041 | 364,826,537 | 3.090 |
| tests/draft7/const.json :: float and integers are equal up to 64-bit representation limits | 4 | 124,528,934 | 349,789,555 | 2.809 |
| tests/draft7/const.json :: nul characters in strings | 2 | 96,681,529 | 152,130,111 | 1.574 |
| tests/draft7/contains.json :: contains keyword validation | 6 | 26,896,163 | 247,296,534 | 9.194 |
| tests/draft7/contains.json :: contains keyword with const keyword | 3 | 18,561,770 | 206,912,274 | 11.147 |
| tests/draft7/contains.json :: contains keyword with boolean schema true | 2 | 103,287,906 | 198,739,136 | 1.924 |
| tests/draft7/contains.json :: contains keyword with boolean schema false | 3 | 62,411,599 | 220,062,401 | 3.526 |
| tests/draft7/contains.json :: items + contains | 4 | 12,278,496 | 17,158,901 | 1.397 |
| tests/draft7/default.json :: invalid type for default | 2 | 146,310,723 | 185,525,265 | 1.268 |
| tests/draft7/default.json :: invalid string value for default | 2 | 106,516,459 | 121,709,686 | 1.143 |
| tests/draft7/definitions.json :: valid definition | 1 | 1,928,542 | 43,915,173 | 22.771 |
| tests/draft7/definitions.json :: invalid definition | 1 | 1,915,414 | 32,432,326 | 16.932 |
| tests/draft7/dependencies.json :: dependencies | 7 | 186,018,750 | 348,315,998 | 1.872 |
| tests/draft7/dependencies.json :: dependencies with empty array | 3 | 408,309,900 | 407,855,652 | 0.999 |
| tests/draft7/dependencies.json :: multiple dependencies | 6 | 76,368,313 | 142,448,435 | 1.865 |
| tests/draft7/dependencies.json :: multiple dependencies subschema | 5 | 85,820,109 | 190,425,216 | 2.219 |
| tests/draft7/dependencies.json :: dependencies with boolean subschemas | 4 | 96,382,973 | 243,315,681 | 2.524 |
| tests/draft7/dependencies.json :: dependencies with escaped characters | 7 | 35,066,614 | 65,553,915 | 1.869 |
| tests/draft7/enum.json :: simple enum validation | 2 | 112,083,489 | 238,714,692 | 2.130 |
| tests/draft7/enum.json :: heterogeneous enum validation | 5 | 17,905,677 | 30,882,309 | 1.725 |
| tests/draft7/enum.json :: heterogeneous enum-with-null validation | 3 | 136,260,576 | 213,085,517 | 1.564 |
| tests/draft7/enum.json :: enums in properties | 6 | 83,761,036 | 207,914,282 | 2.482 |
| tests/draft7/enum.json :: enum with escaped characters | 3 | 153,905,418 | 313,979,890 | 2.040 |
| tests/draft7/enum.json :: enum with false does not match 0 | 3 | 102,286,330 | 349,112,332 | 3.413 |
| tests/draft7/enum.json :: enum with true does not match 1 | 3 | 103,438,393 | 348,336,313 | 3.368 |
| tests/draft7/enum.json :: enum with 0 does not match false | 3 | 146,966,571 | 238,306,951 | 1.622 |
| tests/draft7/enum.json :: enum with 1 does not match true | 3 | 147,067,907 | 229,965,115 | 1.564 |
| tests/draft7/enum.json :: nul characters in strings | 2 | 97,346,263 | 151,863,010 | 1.560 |
| tests/draft7/exclusiveMaximum.json :: exclusiveMaximum validation | 4 | 111,916,138 | 297,666,935 | 2.660 |
| tests/draft7/exclusiveMinimum.json :: exclusiveMinimum validation | 4 | 110,471,122 | 285,120,676 | 2.581 |
| tests/draft7/if-then-else.json :: if and then without else | 3 | 97,762,573 | 226,778,403 | 2.320 |
| tests/draft7/if-then-else.json :: if and else without then | 3 | 72,647,735 | 156,111,167 | 2.149 |
| tests/draft7/if-then-else.json :: validate against correct branch, then vs else | 4 | 52,912,201 | 168,505,270 | 3.185 |
| tests/draft7/if-then-else.json :: if with boolean schema true | 2 | 112,626,290 | 235,342,031 | 2.090 |
| tests/draft7/if-then-else.json :: if with boolean schema false | 2 | 109,820,195 | 227,615,531 | 2.073 |
| tests/draft7/if-then-else.json :: if appears at the end when serialized (keyword processing sequence) | 4 | 60,342,620 | 98,336,022 | 1.630 |
| tests/draft7/infinite-loop-detection.json :: evaluating the same schema location against the same data location twice is not a sign of an infinite loop | 2 | 71,834,256 | 117,588,724 | 1.637 |
| tests/draft7/items.json :: a schema given for items | 4 | 124,089,114 | 222,959,934 | 1.797 |
| tests/draft7/items.json :: an array of schemas for items | 6 | 191,987,768 | 273,163,886 | 1.423 |
| tests/draft7/items.json :: items with boolean schema (true) | 2 | 289,053,655 | 286,216,848 | 0.990 |
| tests/draft7/items.json :: items with boolean schema (false) | 2 | 81,294,581 | 199,108,911 | 2.449 |
| tests/draft7/items.json :: items with boolean schemas | 3 | 138,418,427 | 247,178,075 | 1.786 |
| tests/draft7/items.json :: items and subitems | 6 | 34,006,779 | 71,825,149 | 2.112 |
| tests/draft7/items.json :: nested items | 3 | 17,978,211 | 63,289,248 | 3.520 |
| tests/draft7/maximum.json :: maximum validation | 4 | 176,003,132 | 314,194,094 | 1.785 |
| tests/draft7/maximum.json :: maximum validation with unsigned integer | 4 | 165,386,618 | 293,861,184 | 1.777 |
| tests/draft7/maxItems.json :: maxItems validation | 4 | 191,925,459 | 313,415,489 | 1.633 |
| tests/draft7/maxLength.json :: maxLength validation | 5 | 142,877,787 | 178,017,783 | 1.246 |
| tests/draft7/maxProperties.json :: maxProperties validation | 6 | 123,213,877 | 173,835,881 | 1.411 |
| tests/draft7/maxProperties.json :: maxProperties = 0 means the object is empty | 2 | 64,437,955 | 99,793,906 | 1.549 |
| tests/draft7/minimum.json :: minimum validation | 4 | 175,473,657 | 313,084,704 | 1.784 |
| tests/draft7/minimum.json :: minimum validation with signed integer | 7 | 184,043,909 | 374,730,903 | 2.036 |
| tests/draft7/minItems.json :: minItems validation | 4 | 187,315,360 | 322,454,092 | 1.721 |
| tests/draft7/minLength.json :: minLength validation | 5 | 115,882,653 | 185,501,984 | 1.601 |
| tests/draft7/minProperties.json :: minProperties validation | 6 | 131,849,535 | 190,258,732 | 1.443 |
| tests/draft7/multipleOf.json :: by int | 3 | 115,924,730 | 173,084,409 | 1.493 |
| tests/draft7/multipleOf.json :: by number | 3 | 96,140,340 | 140,588,090 | 1.462 |
| tests/draft7/multipleOf.json :: by small number | 2 | 72,237,519 | 116,775,529 | 1.617 |
| tests/draft7/multipleOf.json :: invalid instance should not raise error when float division = inf | 1 | 13,905,523 | 15,498,217 | 1.115 |
| tests/draft7/not.json :: not | 2 | 75,082,656 | 230,315,227 | 3.067 |
| tests/draft7/not.json :: not multiple types | 3 | 72,086,662 | 280,409,998 | 3.890 |
| tests/draft7/not.json :: not more complex schema | 3 | 82,788,029 | 257,032,173 | 3.105 |
| tests/draft7/not.json :: forbidden property | 2 | 87,694,408 | 188,916,603 | 2.154 |
| tests/draft7/not.json :: not with boolean schema true | 1 | 57,500,623 | 130,199,880 | 2.264 |
| tests/draft7/not.json :: not with boolean schema false | 1 | 146,831,096 | 153,215,950 | 1.043 |
| tests/draft7/oneOf.json :: oneOf | 4 | 32,266,612 | 108,880,860 | 3.374 |
| tests/draft7/oneOf.json :: oneOf with base schema | 3 | 45,837,564 | 78,208,402 | 1.706 |
| tests/draft7/oneOf.json :: oneOf with boolean schemas, all true | 1 | 49,363,960 | 135,313,441 | 2.741 |
| tests/draft7/oneOf.json :: oneOf with boolean schemas, one true | 1 | 27,554,301 | 158,396,413 | 5.749 |
| tests/draft7/oneOf.json :: oneOf with boolean schemas, more than one true | 1 | 49,875,115 | 133,487,389 | 2.676 |
| tests/draft7/oneOf.json :: oneOf with boolean schemas, all false | 1 | 18,088,530 | 132,994,052 | 7.352 |
| tests/draft7/oneOf.json :: oneOf complex types | 4 | 34,402,399 | 134,322,825 | 3.904 |
| tests/draft7/oneOf.json :: oneOf with empty schema | 2 | 63,857,606 | 234,770,160 | 3.676 |
| tests/draft7/oneOf.json :: oneOf with required | 4 | 29,118,088 | 147,567,106 | 5.068 |
| tests/draft7/oneOf.json :: oneOf with missing optional property | 4 | 36,432,850 | 167,053,080 | 4.585 |
| tests/draft7/oneOf.json :: nested oneOf, to check validation semantics | 2 | 46,533,822 | 239,643,316 | 5.150 |
| tests/draft7/optional/bignum.json :: integer | 1 | 27,848,792 | 28,819,525 | 1.035 |
| tests/draft7/optional/bignum.json :: number | 1 | 128,886,985 | 123,274,750 | 0.956 |
| tests/draft7/optional/bignum.json :: integer | 1 | 27,931,239 | 29,762,060 | 1.066 |
| tests/draft7/optional/bignum.json :: number | 1 | 133,707,922 | 138,167,375 | 1.033 |
| tests/draft7/optional/bignum.json :: string | 1 | 63,483,262 | 131,828,392 | 2.077 |
| tests/draft7/optional/bignum.json :: integer comparison | 1 | 125,378,261 | 116,558,796 | 0.930 |
| tests/draft7/optional/bignum.json :: float comparison with high precision | 1 | 51,695,286 | 110,422,728 | 2.136 |
| tests/draft7/optional/bignum.json :: integer comparison | 1 | 122,481,255 | 111,865,765 | 0.913 |
| tests/draft7/optional/bignum.json :: float comparison with high precision on negative numbers | 1 | 52,736,025 | 110,047,189 | 2.087 |
| tests/draft7/optional/content.json :: validation of string-encoded content based on media type | 3 | 403,327,410 | 410,533,073 | 1.018 |
| tests/draft7/optional/content.json :: validation of binary string-encoding | 3 | 412,059,230 | 399,038,152 | 0.968 |
| tests/draft7/optional/content.json :: validation of binary-encoded media type documents | 4 | 529,011,780 | 545,269,253 | 1.031 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 regex $ does not match trailing newline | 2 | 52,681,524 | 57,829,846 | 1.098 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 regex converts \t to horizontal tab | 2 | 52,780,607 | 61,335,420 | 1.162 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 regex escapes control codes with \c and upper letter | 2 | 53,159,991 | 62,641,463 | 1.178 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 regex escapes control codes with \c and lower letter | 2 | 51,657,299 | 62,059,539 | 1.201 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 \d matches ascii digits only | 3 | 52,716,020 | 67,189,905 | 1.275 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 \D matches everything but ascii digits | 3 | 57,090,571 | 60,857,110 | 1.066 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 \w matches ascii letters only | 2 | 53,810,304 | 62,973,803 | 1.170 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 \W matches everything but ascii letters | 2 | 53,101,770 | 62,686,921 | 1.181 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 \s matches whitespace | 11 | 65,311,715 | 67,348,531 | 1.031 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 \S matches everything but whitespace | 11 | 50,567,415 | 71,726,691 | 1.418 |
| tests/draft7/optional/float-overflow.json :: all integers are multiples of 0.5, if overflow is handled | 1 | 13,864,755 | 15,623,724 | 1.127 |
| tests/draft7/optional/non-bmp-regex.json :: Proper UTF-16 surrogate pair handling: pattern | 7 | 56,269,507 | 69,431,704 | 1.234 |
| tests/draft7/optional/non-bmp-regex.json :: Proper UTF-16 surrogate pair handling: patternProperties | 5 | 13,398,523 | 43,888,097 | 3.276 |
| tests/draft7/pattern.json :: pattern validation | 8 | 156,029,152 | 167,396,867 | 1.073 |
| tests/draft7/pattern.json :: pattern is not anchored | 1 | 45,444,622 | 45,041,635 | 0.991 |
| tests/draft7/patternProperties.json :: patternProperties validates properties matching a regex | 7 | 22,905,535 | 58,908,685 | 2.572 |
| tests/draft7/patternProperties.json :: multiple simultaneous patternProperties are validated | 6 | 11,491,415 | 26,416,042 | 2.299 |
| tests/draft7/patternProperties.json :: regexes are not anchored by default and are case sensitive | 4 | 12,111,638 | 27,728,220 | 2.289 |
| tests/draft7/patternProperties.json :: patternProperties with boolean schemas | 5 | 13,829,979 | 49,319,902 | 3.566 |
| tests/draft7/properties.json :: object properties validation | 6 | 122,142,809 | 278,283,091 | 2.278 |
| tests/draft7/properties.json :: properties with boolean schema | 4 | 95,478,318 | 241,775,646 | 2.532 |
| tests/draft7/properties.json :: properties with escaped characters | 2 | 57,612,728 | 136,670,576 | 2.372 |
| tests/draft7/propertyNames.json :: propertyNames validation | 6 | 75,301,202 | 127,497,266 | 1.693 |
| tests/draft7/propertyNames.json :: propertyNames with boolean schema true | 2 | 289,217,966 | 296,909,649 | 1.027 |
| tests/draft7/propertyNames.json :: propertyNames with boolean schema false | 2 | 44,649,794 | 126,613,259 | 2.836 |
| tests/draft7/ref.json :: root pointer ref | 4 | 38,212,808 | 99,352,374 | 2.600 |
| tests/draft7/ref.json :: relative pointer ref to object | 2 | 89,936,318 | 172,790,264 | 1.921 |
| tests/draft7/ref.json :: relative pointer ref to array | 2 | 90,604,983 | 149,467,700 | 1.650 |
| tests/draft7/ref.json :: escaped pointer ref | 6 | 89,770,052 | 195,069,506 | 2.173 |
| tests/draft7/ref.json :: nested refs | 2 | 107,031,575 | 225,643,334 | 2.108 |
| tests/draft7/ref.json :: ref overrides any sibling keywords | 3 | 79,647,366 | 193,177,221 | 2.425 |
| tests/draft7/ref.json :: remote ref, containing refs itself | 2 | 5,785,941 | 88,402,282 | 15.279 |
| tests/draft7/ref.json :: property named $ref that is not a reference | 2 | 94,317,981 | 196,314,134 | 2.081 |
| tests/draft7/ref.json :: property named $ref, containing an actual $ref | 2 | 93,800,236 | 192,788,464 | 2.055 |
| tests/draft7/ref.json :: $ref to boolean schema true | 1 | 154,213,093 | 149,830,993 | 0.972 |
| tests/draft7/ref.json :: $ref to boolean schema false | 1 | 57,355,913 | 134,949,167 | 2.353 |
| tests/draft7/ref.json :: refs with quote | 2 | 89,857,548 | 180,122,841 | 2.005 |
| tests/draft7/ref.json :: naive replacement of $ref with its destination is not correct | 2 | 24,706,716 | 36,178,485 | 1.464 |
| tests/draft7/refRemote.json :: remote ref | 2 | 106,503,278 | 226,625,044 | 2.128 |
| tests/draft7/required.json :: required validation | 5 | 179,955,396 | 345,380,604 | 1.919 |
| tests/draft7/required.json :: required default validation | 1 | 147,018,803 | 158,431,451 | 1.078 |
| tests/draft7/required.json :: required with empty array | 1 | 146,822,344 | 153,028,696 | 1.042 |
| tests/draft7/required.json :: required with escaped characters | 2 | 67,843,838 | 157,967,435 | 2.328 |
| tests/draft7/type.json :: integer type matches integers | 9 | 84,854,716 | 217,684,597 | 2.565 |
| tests/draft7/type.json :: number type matches numbers | 9 | 106,771,396 | 376,823,335 | 3.529 |
| tests/draft7/type.json :: string type matches strings | 9 | 109,260,314 | 380,086,850 | 3.479 |
| tests/draft7/type.json :: object type matches objects | 7 | 82,466,727 | 353,815,228 | 4.290 |
| tests/draft7/type.json :: array type matches arrays | 7 | 85,086,147 | 361,500,616 | 4.249 |
| tests/draft7/type.json :: boolean type matches booleans | 10 | 91,352,140 | 373,567,213 | 4.089 |
| tests/draft7/type.json :: null type matches only the null object | 10 | 83,253,029 | 385,668,384 | 4.632 |
| tests/draft7/type.json :: multiple types can be specified in an array | 7 | 91,212,514 | 243,713,670 | 2.672 |
| tests/draft7/type.json :: type as array with one item | 2 | 118,261,375 | 245,469,800 | 2.076 |
| tests/draft7/type.json :: type: array or object | 5 | 107,698,630 | 328,108,645 | 3.047 |
| tests/draft7/type.json :: type: array, object or null | 5 | 151,460,540 | 344,194,743 | 2.273 |
| tests/draft7/uniqueItems.json :: uniqueItems validation | 23 | 16,070,372 | 24,908,232 | 1.550 |
| tests/draft7/uniqueItems.json :: uniqueItems with an array of items | 8 | 32,024,129 | 53,152,889 | 1.660 |
| tests/draft7/uniqueItems.json :: uniqueItems with an array of items and additionalItems=false | 5 | 43,569,800 | 97,061,590 | 2.228 |
| tests/draft7/uniqueItems.json :: uniqueItems=false validation | 15 | 1,234,124,557 | 767,203,256 | 0.622 |
| tests/draft7/uniqueItems.json :: uniqueItems=false with an array of items | 8 | 287,731,008 | 306,291,195 | 1.065 |
| tests/draft7/uniqueItems.json :: uniqueItems=false with an array of items and additionalItems=false | 5 | 181,768,940 | 246,541,887 | 1.356 |

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
